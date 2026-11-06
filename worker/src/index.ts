import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createClerkClient } from '@clerk/backend';

// The subset of the D1 and R2 binding APIs this worker calls. Defined here
// because @cloudflare/workers-types is not a dependency of the worker.
interface D1Result<T> {
  results: T[];
  success: boolean;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<D1Result<Record<string, unknown>>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface R2PutOptions {
  httpMetadata?: { contentType?: string };
}

interface R2Bucket {
  put(key: string, value: ArrayBuffer, options?: R2PutOptions): Promise<unknown>;
}

type Bindings = {
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_SECRET_KEY: string;
  VITE_CLERK_PUBLISHABLE_KEY?: string;
  DB: D1Database;
  REPORTS_BUCKET: R2Bucket;
};

// Row shape of the `assessments` table (worker/drizzle/0000_round_scorpion.sql).
interface AssessmentRow {
  id: string;
  user_id: string;
  stage: string;
  dominance_pattern: string | null;
  radar_data: string | null;
  tendencies: string | null;
  created_at: number | null;
}

// Shape sent by src/features/dashboard/Dashboard.tsx; not validated at runtime.
interface SaveAttemptBody {
  stage?: string;
  answers?: Record<string, unknown>;
  dominancePattern?: string;
  radarData?: unknown[];
  tendencies?: unknown[];
}

// Mirrors reading `.message` off whatever was thrown, without assuming an Error.
function thrownMessage(error: unknown): unknown {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return error.message;
  }
  return undefined;
}

const app = new Hono<{ Bindings: Bindings, Variables: { userId: string } }>();

app.onError((err, c) => {
  console.error(`Error processing ${c.req.method} ${c.req.url}:`, err);
  return c.json({ error: "Internal Server Error" }, 500);
});

// Setup CORS
app.use('/*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['POST', 'GET', 'OPTIONS', 'PATCH', 'DELETE'],
}));

// Auth Middleware using Clerk Backend API
app.use('/api/*', async (c, next) => {
  const publishableKey = c.env.CLERK_PUBLISHABLE_KEY || c.env.VITE_CLERK_PUBLISHABLE_KEY;
  
  if (!publishableKey || !c.env.CLERK_SECRET_KEY) {
    return c.json({ 
      error: "Configuration Error", 
      details: "Clerk keys are missing from environment bindings. Please ensure CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are set." 
    }, 500);
  }

  const clerkClient = createClerkClient({
    secretKey: c.env.CLERK_SECRET_KEY,
    publishableKey: publishableKey,
  });

  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return c.json({ error: "Missing Authorization header" }, 401);
  }

  try {
    const requestState = await clerkClient.authenticateRequest(c.req.raw, {
      secretKey: c.env.CLERK_SECRET_KEY,
      publishableKey: publishableKey,
    });
    
    if (!requestState.isSignedIn) {
      return c.json({ error: "Unauthorized", details: requestState.reason, message: requestState.message }, 401);
    }
    
    // Store userId in context
    c.set('userId', requestState.toAuth().userId);
    await next();
  } catch (error) {
    return c.json({ error: "Auth Exception", details: thrownMessage(error) }, 401);
  }
});

app.get('/', (c) => {
  return c.text('Jatimetri Assessment API is running');
});

// Create Worker API endpoint: POST /api/save-attempt
app.post('/api/save-attempt', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<SaveAttemptBody>();
  const DB = c.env.DB;

  // Ensure user exists (upsert)
  await DB.prepare(
    "INSERT OR IGNORE INTO users (id) VALUES (?)"
  ).bind(userId).run();

  // Insert assessment
  const assessmentId = crypto.randomUUID();
  const stage = body.stage || 'unknown';
  const dominancePattern = body.dominancePattern || '';
  const radarData = JSON.stringify(body.radarData || []);
  const tendencies = JSON.stringify(body.tendencies || []);

  await DB.prepare(
    "INSERT INTO assessments (id, user_id, stage, dominance_pattern, radar_data, tendencies, created_at) VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now'))"
  ).bind(assessmentId, userId, stage, dominancePattern, radarData, tendencies).run();

  return c.json({ success: true, assessmentId });
});

// Create Worker API endpoint: GET /api/reports
app.get('/api/reports', async (c) => {
  const userId = c.get('userId');
  const DB = c.env.DB;

  const { results } = await DB.prepare(
    "SELECT * FROM assessments WHERE user_id = ? ORDER BY created_at DESC"
  ).bind(userId).all<AssessmentRow>();

  return c.json({ success: true, reports: results || [] });
});

// Create Worker API endpoint: PATCH /api/profile
app.patch('/api/profile', async (c) => {
  // Placeholder for user settings update
  return c.json({ success: true, message: "Profile updated" });
});

// Create Worker API endpoint: DELETE /api/assessments/:id
app.delete('/api/assessments/:id', async (c) => {
  const userId = c.get('userId');
  const assessmentId = c.req.param('id');
  const DB = c.env.DB;

  // Ensure it belongs to the authenticated user before deleting
  const { results } = await DB.prepare(
    "SELECT id FROM assessments WHERE id = ? AND user_id = ?"
  ).bind(assessmentId, userId).all<Pick<AssessmentRow, 'id'>>();

  if (!results || results.length === 0) {
    return c.json({ error: "Not found or unauthorized" }, 404);
  }

  await DB.prepare(
    "DELETE FROM assessments WHERE id = ? AND user_id = ?"
  ).bind(assessmentId, userId).run();

  return c.json({ success: true });
});

// Create Worker API endpoint: POST /api/upload-pdf
app.post('/api/upload-pdf', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.formData();
  
  const file = body.get('file') as File;
  const assessmentId = body.get('assessmentId') as string;

  if (!file || !assessmentId) {
    return c.json({ error: "Missing file or assessmentId" }, 400);
  }

  const fileKey = `${userId}/${assessmentId}.pdf`;

  // Upload to R2 Bucket
  await c.env.REPORTS_BUCKET.put(fileKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: "application/pdf" },
  });

  return c.json({ success: true, fileKey });
});

export default app;

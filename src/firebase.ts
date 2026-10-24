import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDocFromServer,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import firebaseAppletConfig from '../firebase-applet-config.json';

export type LeadSource =
  | 'nav_cta'
  | 'hero_inline'
  | 'broker_search_gate'
  | 'post_demo_inline'
  | 'pricing_tier_cta'
  | 'final_cta_inline';

export type PricingTierName =
  | 'Dock & Broker Audit — Free'
  | 'Recovery + Search — $99/truck/mo'
  | 'Back-Claims — 20% of recovery'
  | null;

export interface LeadRecord {
  id?: string;
  email: string;
  timestamp: string | ReturnType<typeof serverTimestamp>;
  source: LeadSource;
  tier: PricingTierName;
  channel: string | null;
  search_query: string | null;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

const isFirebaseConfigured = Boolean(
  firebaseAppletConfig?.projectId && firebaseAppletConfig?.apiKey
);

const app = isFirebaseConfigured
  ? getApps().length === 0
    ? initializeApp(firebaseAppletConfig)
    : getApps()[0]
  : null;

export const db =
  app && firebaseAppletConfig.firestoreDatabaseId
    ? getFirestore(app, firebaseAppletConfig.firestoreDatabaseId)
    : app
    ? getFirestore(app)
    : null;

export const auth = app ? getAuth(app) : null;

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid ?? null,
      email: auth?.currentUser?.email ?? null,
      emailVerified: auth?.currentUser?.emailVerified ?? null,
      isAnonymous: auth?.currentUser?.isAnonymous ?? null,
      tenantId: auth?.currentUser?.tenantId ?? null,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot
async function testConnection() {
  if (!db) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export function detectAcquisitionChannel(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref') || params.get('utm_source');
  if (ref) return ref.trim().slice(0, 120);
  if (document.referrer) {
    try {
      return new URL(document.referrer).hostname.slice(0, 120);
    } catch {
      return null;
    }
  }
  return 'direct';
}

export async function submitFleetLead(params: {
  email: string;
  source: LeadSource;
  tier: PricingTierName;
  searchQuery?: string | null;
  honeypot: string;
}): Promise<{
  status: 'stored' | 'honeypot_dropped' | 'duplicate_skipped';
  record: LeadRecord;
}> {
  const normalizedEmail = params.email.trim().toLowerCase().slice(0, 254);
  const channel = detectAcquisitionChannel();
  const cleanSearchQuery = params.searchQuery
    ? params.searchQuery.trim().slice(0, 100)
    : null;

  // 1. Honeypot trap: silently drop automated bot submissions
  if (params.honeypot && params.honeypot.trim().length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return {
      status: 'honeypot_dropped',
      record: {
        email: normalizedEmail,
        timestamp: new Date().toISOString(),
        source: params.source,
        tier: params.tier,
        channel,
        search_query: cleanSearchQuery,
      },
    };
  }

  // 2. Session idempotency check
  const dedupeKey = `bol_lead_${normalizedEmail}_${params.tier ?? 'none'}_${
    cleanSearchQuery ?? 'none'
  }`;
  if (sessionStorage.getItem(dedupeKey)) {
    const existing = JSON.parse(sessionStorage.getItem(dedupeKey)!);
    return { status: 'duplicate_skipped', record: existing };
  }

  // 3. Write to Cloud Firestore `leads` collection
  if (db) {
    try {
      const docRef = await addDoc(collection(db, 'leads'), {
        email: normalizedEmail,
        timestamp: serverTimestamp(),
        source: params.source,
        tier: params.tier,
        channel,
        search_query: cleanSearchQuery,
      });
      const storedRecord: LeadRecord = {
        id: docRef.id,
        email: normalizedEmail,
        timestamp: Timestamp.now().toDate().toISOString(),
        source: params.source,
        tier: params.tier,
        channel,
        search_query: cleanSearchQuery,
      };
      sessionStorage.setItem(dedupeKey, JSON.stringify(storedRecord));
      return { status: 'stored', record: storedRecord };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'leads');
    }
  }

  // Fallback local ledger if Firestore is unreachable
  const localRecord: LeadRecord = {
    id: `local_${Math.random().toString(36).slice(2, 10)}`,
    email: normalizedEmail,
    timestamp: new Date().toISOString(),
    source: params.source,
    tier: params.tier,
    channel,
    search_query: cleanSearchQuery,
  };
  const existingLedger: LeadRecord[] = JSON.parse(
    localStorage.getItem('billoff_lading_leads_ledger') || '[]'
  );
  existingLedger.push(localRecord);
  localStorage.setItem(
    'billoff_lading_leads_ledger',
    JSON.stringify(existingLedger)
  );
  sessionStorage.setItem(dedupeKey, JSON.stringify(localRecord));
  return { status: 'stored', record: localRecord };
}

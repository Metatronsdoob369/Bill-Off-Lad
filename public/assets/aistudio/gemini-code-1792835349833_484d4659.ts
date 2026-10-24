import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

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

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const isFirebaseConfigured = Boolean(firebaseConfig.projectId && firebaseConfig.apiKey);
const app = isFirebaseConfigured
  ? getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApps()[0]
  : null;
const db = app ? getFirestore(app) : null;

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
}): Promise<{ status: 'stored' | 'honeypot_dropped' | 'duplicate_skipped'; record: LeadRecord }> {
  const normalizedEmail = params.email.trim().toLowerCase();
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
  const dedupeKey = `bol_lead_${normalizedEmail}_${params.tier ?? 'none'}_${cleanSearchQuery ?? 'none'}`;
  if (sessionStorage.getItem(dedupeKey)) {
    const existing = JSON.parse(sessionStorage.getItem(dedupeKey)!);
    return { status: 'duplicate_skipped', record: existing };
  }

  // 3. Write to Cloud Firestore `leads` collection
  if (db) {
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
  }

  // Fallback local ledger before "Enable Firebase" is clicked
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
  localStorage.setItem('billoff_lading_leads_ledger', JSON.stringify(existingLedger));
  sessionStorage.setItem(dedupeKey, JSON.stringify(localRecord));
  return { status: 'stored', record: localRecord };
}
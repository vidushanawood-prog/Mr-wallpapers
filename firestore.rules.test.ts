/**
 * Firestore Security Rules Specification Test Suite
 * Verifies that all Dirty Dozen adversarial payloads are rejected with PERMISSION_DENIED.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email?: string; email_verified?: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on Wallpaper',
    collectionPath: '/wallpapers/wp_valid_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'vidushanawood@gmail.com', email_verified: true },
    payload: {
      title: 'Obsidian Monolith',
      isVerifiedGhostField: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Admin Email Spoof',
    collectionPath: '/user_private/other_user',
    operation: 'get',
    auth: { uid: 'spoof_uid', email: 'vidushanawood@gmail.com', email_verified: false },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'PII Lateral Read on user_private',
    collectionPath: '/user_private/victim_uid',
    operation: 'get',
    auth: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Self-Assigned Creator Role Escalation',
    collectionPath: '/users/attacker_uid',
    operation: 'create',
    auth: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    payload: {
      uid: 'attacker_uid',
      displayName: 'Attacker',
      role: 'creator',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Identity Spoofing on Wallpaper Create',
    collectionPath: '/wallpapers/wp_spoof',
    operation: 'create',
    auth: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    payload: {
      authorId: 'vidusha_uid',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Path ID Poisoning',
    collectionPath: '/wallpapers/invalid$id!with@symbols',
    operation: 'create',
    auth: { uid: 'user_1', email: 'vidushanawood@gmail.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Orphaned Chunk Write Without Parent Wallpaper',
    collectionPath: '/wallpapers/missing_parent/chunks/chunk_0',
    operation: 'create',
    auth: { uid: 'user_1', email: 'vidushanawood@gmail.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Timestamp Forgery on Create',
    collectionPath: '/saves/save_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@example.com', email_verified: true },
    payload: {
      userId: 'user_1',
      wallpaperId: 'wp_1',
      boardName: 'Favorites',
      createdAt: '2020-01-01T00:00:00Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Value Poisoning on Wallpaper Counter Update',
    collectionPath: '/wallpapers/wp_1',
    operation: 'update',
    auth: { uid: 'user_1', email: 'user1@example.com', email_verified: true },
    payload: {
      downloadsCount: 'NOT_A_NUMBER',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Immortal Field Mutation on Update',
    collectionPath: '/wallpapers/wp_1',
    operation: 'update',
    auth: { uid: 'user_1', email: 'vidushanawood@gmail.com', email_verified: true },
    payload: {
      authorId: 'new_owner_uid',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Unbounded String DoW Attack on Title',
    collectionPath: '/wallpapers/wp_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'vidushanawood@gmail.com', email_verified: true },
    payload: {
      title: 'A'.repeat(500),
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unauthorized Cross-User Save List Scrape',
    collectionPath: '/saves',
    operation: 'list',
    auth: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
];

# MR Wallpapers Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **PII Isolation Invariant**: User email addresses are strictly isolated in `/user_private/{userId}` and never stored in `/users/{userId}`. Only the owner (`request.auth.uid == userId`) or the verified bootstrapped admin (`vidushanawood@gmail.com` with `email_verified == true`) or explicit `/admins/{uid}` document holder can read `/user_private/{userId}`.
2. **Self-Assigned Role Prevention Invariant**: Users creating `/users/{userId}` can only assign `role == 'member'` unless they are `isAdmin()`, preventing privilege escalation.
3. **Creator Upload Gate Invariant**: Wallpapers in `/wallpapers/{wallpaperId}` and chunks in `/wallpapers/{wallpaperId}/chunks/{chunkId}` require verified authentication (`email_verified == true`), strict schema validation (`isValidWallpaper`), and `incoming().authorId == request.auth.uid`.
4. **Master Gate Relational Sync Invariant**: Every chunk in `/wallpapers/{wallpaperId}/chunks/{chunkId}` must verify that parent `/wallpapers/{wallpaperId}` exists and belongs to the same author.
5. **Temporal & Immutable Integrity Invariant**: `createdAt` must equal `request.time` on creation and remain immutable on update. `authorId`, `uid`, and `userId` are strictly immutable after creation.
6. **Query Enforcer Invariant**: Every `allow list` rule evaluates `resource.data` directly (e.g., `resource.data.visibility == 'public'` for wallpapers, `resource.data.userId == request.auth.uid` for saves, or `isAdmin()` for admin email directory) without delegating filtering to the client.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Payload 1 (Shadow Field Injection on Wallpaper)**: Includes `isFeatured: true` ghost key not in `hasOnly` allowlist. -> `PERMISSION_DENIED`
2. **Payload 2 (Unverified Admin Email Spoof)**: Token has `email: "vidushanawood@gmail.com"` but `email_verified: false`. -> `PERMISSION_DENIED`
3. **Payload 3 (PII Lateral Read)**: Authenticated user `user_B` attempts `get` on `/user_private/user_A`. -> `PERMISSION_DENIED`
4. **Payload 4 (Self-Assigned Creator Role)**: Normal user creates `/users/user_A` with `role: "creator"`. -> `PERMISSION_DENIED`
5. **Payload 5 (Identity Spoofing on Wallpaper Create)**: Authenticated `user_A` creates `/wallpapers/wp_1` with `authorId: "user_B"`. -> `PERMISSION_DENIED`
6. **Payload 6 (Path ID Poisoning)**: Document ID contains 200 characters or invalid characters (`wp$123!`). -> `PERMISSION_DENIED`
7. **Payload 7 (Orphaned Chunk Write)**: User writes to `/wallpapers/non_existent_wp/chunks/chunk_0` where parent wallpaper does not exist. -> `PERMISSION_DENIED`
8. **Payload 8 (Timestamp Forgery)**: Client supplies a past or future `createdAt` timestamp instead of `request.time`. -> `PERMISSION_DENIED`
9. **Payload 9 (Update Gap / Value Poisoning)**: User updates `/wallpapers/wp_1` `downloadsCount` with a string `"999999"` instead of an integer increment. -> `PERMISSION_DENIED`
10. **Payload 10 (Immortal Field Mutation)**: Author updates `/wallpapers/wp_1` and attempts to mutate `createdAt` or `authorId`. -> `PERMISSION_DENIED`
11. **Payload 11 (Unbounded String DoW Attack)**: Attacker submits a 5,000-character `title` on `/wallpapers/wp_1`. -> `PERMISSION_DENIED`
12. **Payload 12 (Unauthorized Save List Scrape)**: User attempts to `list` `/saves` without filtering `resource.data.userId == request.auth.uid`. -> `PERMISSION_DENIED`

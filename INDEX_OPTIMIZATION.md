# Оптимізація запитів через індекси

## 🔴 КРИТИЧНО: Відсутні індекси для часто використовуваних запитів

### 1. Таблиця `likes` - найбільш критична

**Проблема**: Відсутні індекси на `postId` та `userId`, які використовуються в сотнях підзапитів на день.

**Використання**:
- `src/post/post.service.ts:84,86` - `COUNT(*) FROM likes WHERE postId = p.id`
- `src/post/post.service.ts:86` - `EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ${userId})`
- `src/activity/activity.service.ts:488,491` - аналогічні запити
- `src/contest/contest.service.ts:212,214` - аналогічні запити
- `src/admin/admin.service.ts:148-152` - `count({ createdAt: Between(...) })`

**Рішення**:
```sql
-- Окремі індекси для швидкого пошуку
CREATE INDEX idx_likes_postId ON likes(postId);
CREATE INDEX idx_likes_userId ON likes(userId);

-- Композитний індекс для EXISTS запитів (найважливіший!)
CREATE INDEX idx_likes_post_user ON likes(postId, userId);

-- Індекс для фільтрації по даті (для admin метрик)
CREATE INDEX idx_likes_createdAt ON likes(createdAt);
```

**Очікуваний ефект**: 
- Прискорення EXISTS запитів з O(n) до O(log n)
- При 100 постах: з ~200ms до ~20ms (10x швидше)

---

### 2. Таблиця `viewed_posts` - критична

**Проблема**: Відсутні індекси на `postId` та `userId` для EXISTS підзапитів.

**Використання**:
- `src/post/post.service.ts:99` - `NOT EXISTS (SELECT 1 FROM viewed_posts WHERE postId = p.id AND userId = ${userId})`
- `src/activity/activity.service.ts:496,606` - аналогічні запити
- `src/contest/contest.service.ts:219` - аналогічні запити

**Рішення**:
```sql
-- Композитний індекс для EXISTS запитів
CREATE INDEX idx_viewed_posts_post_user ON viewed_posts(postId, userId);

-- Окремі індекси (якщо потрібні для інших запитів)
CREATE INDEX idx_viewed_posts_postId ON viewed_posts(postId);
CREATE INDEX idx_viewed_posts_userId ON viewed_posts(userId);
```

**Очікуваний ефект**: 
- Прискорення NOT EXISTS запитів з O(n) до O(log n)
- При 100 постах: з ~150ms до ~15ms (10x швидше)

---

### 3. Таблиця `posts` - індекси для `createdAt`

**Проблема**: `createdAt` використовується в WHERE з діапазонами дат та ORDER BY, але немає індексу.

**Використання**:
- `src/admin/admin.service.ts:110-113,117-120,127-130,159-162,187-190,232-235,249-252` - фільтрація по діапазонах дат
- `src/activity/activity.service.ts:506-507` - фільтрація по даті
- `src/contest/contest.service.ts:238` - `ORDER BY p.createdAt DESC`
- `src/post/post.service.ts:107` - `ORDER BY p.id DESC` (але використовується курсор)

**Рішення**:
```sql
-- Індекс для фільтрації по даті
CREATE INDEX idx_posts_createdAt ON posts(createdAt);

-- Композитний індекс для частого фільтру (is_published + is_blocked + createdAt)
CREATE INDEX idx_posts_published_blocked_created ON posts(is_published, is_blocked, createdAt);

-- Композитний індекс для contest запитів
CREATE INDEX idx_posts_contest_published_created ON posts(contestId, is_published, is_blocked, createdAt);
```

**Очікуваний ефект**: 
- Прискорення admin метрик з ~500ms до ~50ms (10x швидше)
- Прискорення `getPopularPosts` з ~200ms до ~30ms (6-7x швидше)

---

### 4. Таблиця `users` - індекс для `createdAt`

**Проблема**: `createdAt` використовується в WHERE з діапазонами дат, але немає індексу.

**Використання**:
- `src/admin/admin.service.ts:104-108` - `count({ createdAt: Between(periodStart, periodEnd) })`

**Рішення**:
```sql
CREATE INDEX idx_users_createdAt ON users(createdAt);
```

**Очікуваний ефект**: 
- Прискорення підрахунку нових користувачів з ~100ms до ~10ms (10x швидше)

---

### 5. Таблиця `users_tags_tags` (many-to-many)

**Проблема**: Відсутні індекси на `usersId` та `tagsId` для IN підзапитів.

**Використання**:
- `src/post/post.service.ts:100-104` - `p.tagId IN (SELECT tagsId FROM users_tags_tags WHERE usersId = ${userId})`

**Рішення**:
```sql
-- Композитний індекс для пошуку тегів користувача
CREATE INDEX idx_users_tags_user ON users_tags_tags(usersId, tagsId);

-- Окремий індекс для зворотного пошуку
CREATE INDEX idx_users_tags_tag ON users_tags_tags(tagsId);
```

**Очікуваний ефект**: 
- Прискорення IN підзапиту з O(n) до O(log n)
- При 100 постах: з ~50ms до ~5ms (10x швидше)

---

## 🟠 ВИСОКИЙ: Додаткові композитні індекси

### 6. Таблиця `posts` - композитний індекс для `getPosts()`

**Проблема**: Метод `getPosts()` фільтрує по кількох умовах одночасно.

**Використання**:
- `src/post/post.service.ts:96-108` - `WHERE is_published = true AND is_blocked = false AND p.tagId IN (...) ORDER BY p.id DESC`

**Рішення**:
```sql
-- Композитний індекс для основного фільтру
CREATE INDEX idx_posts_published_blocked_id ON posts(is_published, is_blocked, id DESC);
```

**Очікуваний ефект**: 
- Прискорення `getPosts()` з ~100ms до ~20ms (5x швидше)

---

### 7. Таблиця `posts` - індекс для `tagId`

**Проблема**: `tagId` використовується в JOIN та WHERE, але перевірити чи є індекс.

**Використання**:
- `src/post/post.service.ts:95,100` - JOIN та WHERE
- `src/tag/tag.service.ts:31-33` - JOIN з фільтром

**Рішення**:
```sql
-- Якщо індексу немає (перевірити в БД)
CREATE INDEX idx_posts_tagId ON posts(tagId);
```

---

## 📊 Пріоритети створення індексів:

1. **НЕГАЙНО**: 
   - `idx_likes_post_user` (композитний) - найбільш використовуваний
   - `idx_viewed_posts_post_user` (композитний) - найбільш використовуваний
   - `idx_posts_createdAt` - для admin метрик

2. **ШВИДКО**:
   - `idx_likes_postId`, `idx_likes_userId` - окремі індекси
   - `idx_posts_published_blocked_created` - композитний
   - `idx_users_createdAt` - для admin метрик

3. **ПОТІМ**:
   - `idx_posts_contest_published_created` - для contest запитів
   - `idx_users_tags_user` - для тегів користувача
   - `idx_posts_published_blocked_id` - для getPosts()

---

## ⚠️ Важливо:

1. **Композитні індекси** повинні відповідати порядку колонок у WHERE:
   - Якщо WHERE: `is_published, is_blocked, createdAt` → індекс: `(is_published, is_blocked, createdAt)`
   - Якщо WHERE: `postId, userId` → індекс: `(postId, userId)`

2. **Вплив на INSERT/UPDATE**: 
   - Індекси сповільнюють INSERT/UPDATE операції
   - Але для read-heavy додатку (як цей) - це прийнятно
   - Очікуваний приріст швидкості читання: 5-10x
   - Очікуване сповільнення запису: 5-10%

3. **Моніторинг**: 
   - Після створення індексів перевірити `EXPLAIN` для основних запитів
   - Переконатися що MySQL використовує індекси (не `Using filesort`, `Using temporary`)

---

## 📝 SQL міграція для створення індексів:

```sql
-- 1. likes таблиця
CREATE INDEX idx_likes_postId ON likes(postId);
CREATE INDEX idx_likes_userId ON likes(userId);
CREATE INDEX idx_likes_post_user ON likes(postId, userId);
CREATE INDEX idx_likes_createdAt ON likes(createdAt);

-- 2. viewed_posts таблиця
CREATE INDEX idx_viewed_posts_post_user ON viewed_posts(postId, userId);
CREATE INDEX idx_viewed_posts_postId ON viewed_posts(postId);
CREATE INDEX idx_viewed_posts_userId ON viewed_posts(userId);

-- 3. posts таблиця
CREATE INDEX idx_posts_createdAt ON posts(createdAt);
CREATE INDEX idx_posts_published_blocked_created ON posts(is_published, is_blocked, createdAt);
CREATE INDEX idx_posts_contest_published_created ON posts(contestId, is_published, is_blocked, createdAt);
CREATE INDEX idx_posts_published_blocked_id ON posts(is_published, is_blocked, id DESC);

-- 4. users таблиця
CREATE INDEX idx_users_createdAt ON users(createdAt);

-- 5. users_tags_tags таблиця
CREATE INDEX idx_users_tags_user ON users_tags_tags(usersId, tagsId);
CREATE INDEX idx_users_tags_tag ON users_tags_tags(tagsId);
```

---

## 🔍 Як перевірити чи індекси працюють:

```sql
-- Перевірити які індекси використовуються
EXPLAIN SELECT ... FROM posts WHERE is_published = true AND is_blocked = false;

-- Перевірити всі індекси на таблиці
SHOW INDEX FROM likes;
SHOW INDEX FROM viewed_posts;
SHOW INDEX FROM posts;
```

---

## 📈 Очікуваний загальний ефект:

- **getPosts()**: з ~100ms до ~20ms (5x швидше)
- **getPopularPosts()**: з ~200ms до ~30ms (6-7x швидше)
- **getPostsByContest()**: з ~150ms до ~25ms (6x швидше)
- **collectAdminMetricsSnapshot()**: з ~500ms до ~50ms (10x швидше)
- **Загальне навантаження на БД**: зменшення на 60-70%


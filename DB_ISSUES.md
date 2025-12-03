# Проблеми в структурі бази даних

## 🔴 КРИТИЧНО: Відсутні індекси на foreign keys

### 1. Таблиця `likes` - відсутні індекси на foreign keys

**Проблема**: Foreign keys `userId` та `postId` не мають індексів, хоча використовуються в кожному запиті.

**Поточний стан** (`src/like/entities/like.entity.ts`):
```typescript
@ManyToOne(() => UserEntity, (user) => user.likes, { onDelete: 'CASCADE' })
user: UserEntity;

@ManyToOne(() => PostEntity, (post) => post.likes, { onDelete: 'CASCADE' })
post: PostEntity;
```

**Рішення**: Додати індекси (вже в міграції `1764701100000-add-performance-indexes.ts` ✅):
```sql
CREATE INDEX idx_likes_postId ON likes(postId);
CREATE INDEX idx_likes_userId ON likes(userId);
CREATE INDEX idx_likes_post_user ON likes(postId, userId);
```

**Статус**: ✅ Вже вирішено в міграції

---

### 2. Таблиця `viewed_posts` - відсутні індекси на foreign keys

**Проблема**: Foreign keys `userId` та `postId` не мають індексів.

**Поточний стан** (`src/post/entities/viwed.entity.ts`):
```typescript
@ManyToOne(() => UserEntity, (user) => user.viewedPosts, {
  onDelete: 'CASCADE',
})
user: UserEntity;

@ManyToOne(() => PostEntity, (post) => post.viewedBy, {
  onDelete: 'CASCADE',
})
post: PostEntity;
```

**Рішення**: Додати індекси (вже в міграції ✅):
```sql
CREATE INDEX idx_viewed_posts_post_user ON viewed_posts(postId, userId);
CREATE INDEX idx_viewed_posts_postId ON viewed_posts(postId);
CREATE INDEX idx_viewed_posts_userId ON viewed_posts(userId);
```

**Статус**: ✅ Вже вирішено в міграції

---

### 3. Таблиця `activity` - відсутні індекси на foreign keys

**Проблема**: Foreign keys `from_user_id`, `to_user_id`, `contest_id`, `post_id` можуть не мати індексів.

**Поточний стан** (`src/activity/entities/activity.entity.ts`):
```typescript
@ManyToOne(() => UserEntity, { nullable: true, onDelete: 'CASCADE' })
@JoinColumn({ name: 'from_user_id' })
fromUser: UserEntity;

@ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
@JoinColumn({ name: 'to_user_id' })
toUser: UserEntity;

@ManyToOne(() => ContestEntity, { nullable: true, onDelete: 'CASCADE' })
@JoinColumn({ name: 'contest_id' })
contest: ContestEntity | null;

@ManyToOne(() => PostEntity, { nullable: true, onDelete: 'CASCADE' })
@JoinColumn({ name: 'post_id' })
post: PostEntity | null;
```

**Рішення**: Додати індекси:
```sql
CREATE INDEX idx_activity_to_user ON activity(to_user_id);
CREATE INDEX idx_activity_from_user ON activity(from_user_id);
CREATE INDEX idx_activity_contest ON activity(contest_id);
CREATE INDEX idx_activity_post ON activity(post_id);
CREATE INDEX idx_activity_createdAt ON activity(createdAt);
CREATE INDEX idx_activity_isRead ON activity(isRead);
```

**Очікуваний ефект**: 
- Прискорення запитів активностей користувача
- Прискорення фільтрації по `isRead`

---

## 🟠 ВИСОКИЙ: Відсутні індекси на часто використовувані колонки

### 4. Таблиця `posts` - відсутній індекс на `tagId`

**Проблема**: `tagId` використовується в JOIN та WHERE, але може не мати індексу.

**Використання**:
- `src/post/post.service.ts:95,100` - JOIN та WHERE
- `src/tag/tag.service.ts:31-33` - JOIN з фільтром

**Рішення**: Перевірити чи є індекс, якщо немає - додати:
```sql
CREATE INDEX idx_posts_tagId ON posts(tagId);
```

**Статус**: Потрібно перевірити в БД

---

### 5. Таблиця `posts` - відсутній індекс на `userId`

**Проблема**: `userId` використовується в JOIN, але може не мати індексу.

**Рішення**: Перевірити чи є індекс, якщо немає - додати:
```sql
CREATE INDEX idx_posts_userId ON posts(userId);
```

**Статус**: Потрібно перевірити в БД

---

### 6. Таблиця `activity` - відсутні індекси для фільтрації

**Проблема**: Часто фільтруємо по `to_user_id`, `isRead`, `activityType`, `createdAt`, але індекси можуть бути відсутні.

**Використання**:
- `src/activity/activity.service.ts:160-168` - `getFilteredActivities()` фільтрує по `toUser`, `activityType`, `createdAt`
- `src/user/user.service.ts:588-594` - підрахунок непрочитаних активностей

**Рішення**: Додати композитні індекси:
```sql
CREATE INDEX idx_activity_to_user_read ON activity(to_user_id, isRead);
CREATE INDEX idx_activity_to_user_type ON activity(to_user_id, activityType);
CREATE INDEX idx_activity_to_user_created ON activity(to_user_id, createdAt);
```

---

## 🟠 ВИСОКИЙ: Проблеми з типами даних та обмеженнями

### 7. Таблиця `posts` - `generation_params` може бути NULL

**Проблема**: `generation_params` має тип JSON NULL, але в коді очікується що він завжди є.

**Поточний стан**:
```typescript
@Column({ type: 'json', nullable: true })
generation_params: { ... } | null;
```

**Ризик**: 
- Можливі помилки при обробці `null` значень
- Непослідовність даних

**Рішення**: Або зробити NOT NULL з default, або гарантувати що завжди заповнюється:
```sql
ALTER TABLE posts MODIFY generation_params JSON NOT NULL DEFAULT (JSON_OBJECT('prompt', 'Unknown', 'ai_service', 'flux', 'orientation', 'vertical'));
```

---

### 8. Таблиця `users` - `email` може не мати UNIQUE constraint

**Проблема**: `email` має бути унікальним, але може не мати UNIQUE індексу.

**Поточний стан** (`src/user/entities/user.entity.ts`):
```typescript
@Column()
email: string;
```

**Рішення**: Додати UNIQUE індекс:
```sql
CREATE UNIQUE INDEX idx_users_email ON users(email);
```

**Статус**: Потрібно перевірити в БД

---

### 9. Таблиця `posts` - `is_delivered` не має індексу

**Проблема**: `is_delivered` використовується для фільтрації непереданих постів, але може не мати індексу.

**Використання**:
- `src/notification/notification.gateway.ts:124-127` - пошук непереданих постів

**Рішення**: Додати індекс:
```sql
CREATE INDEX idx_posts_delivered ON posts(is_delivered);
CREATE INDEX idx_posts_user_delivered ON posts(userId, is_delivered);
```

---

## 🟡 СЕРЕДНІЙ: Проблеми з каскадними видаленнями

### 10. Таблиця `contests` - `tagId` має `NO ACTION` замість `SET NULL`

**Проблема**: Якщо тег видаляється, contest може залишитися з неіснуючим `tagId`.

**Поточний стан** (`src/contest/entity/contest.entity.ts`):
```typescript
@ManyToOne(() => TagEntity, (tag) => tag.contests, {
  nullable: true,
  onDelete: 'NO ACTION',
})
tag: TagEntity;
```

**Ризик**: 
- Помилка при видаленні тегу, якщо є активні contests
- Неможливість видалити тег

**Рішення**: Змінити на `SET NULL`:
```sql
ALTER TABLE contests DROP FOREIGN KEY FK_d139428a7e7a97e2dd0fdda1b43;
ALTER TABLE contests ADD CONSTRAINT FK_d139428a7e7a97e2dd0fdda1b43 
  FOREIGN KEY (tagId) REFERENCES tags(id) ON DELETE SET NULL;
```

---

### 11. Таблиця `posts` - `tagId` може не мати foreign key constraint

**Проблема**: `tagId` може не мати foreign key, що дозволяє вставити неіснуючий tagId.

**Поточний стан**:
```typescript
@ManyToOne(() => TagEntity, (tag) => tag.posts)
@Index()
tag: TagEntity;
```

**Рішення**: Перевірити чи є foreign key, якщо немає - додати:
```sql
ALTER TABLE posts ADD CONSTRAINT FK_posts_tag 
  FOREIGN KEY (tagId) REFERENCES tags(id) ON DELETE SET NULL;
```

**Статус**: Потрібно перевірити в БД

---

## 🟡 СЕРЕДНІЙ: Відсутні обмеження на дані

### 12. Таблиця `users` - `points` може бути від'ємною

**Проблема**: Немає CHECK constraint для `points >= 0`.

**Рішення**: Додати обмеження:
```sql
ALTER TABLE users ADD CONSTRAINT chk_points_non_negative CHECK (points >= 0);
```

---

### 13. Таблиця `contests` - `reward` може бути від'ємним

**Проблема**: Немає CHECK constraint для `reward >= 0`.

**Рішення**: Додати обмеження:
```sql
ALTER TABLE contests ADD CONSTRAINT chk_reward_non_negative CHECK (reward IS NULL OR reward >= 0);
```

---

### 14. Таблиця `contests` - `start_time` має бути < `end_time`

**Проблема**: Немає CHECK constraint для валідації часу.

**Рішення**: Додати обмеження:
```sql
ALTER TABLE contests ADD CONSTRAINT chk_contest_times CHECK (start_time < end_time);
```

---

## 🟡 СЕРЕДНІЙ: Потенційні проблеми з продуктивністю

### 15. Таблиця `users_tags_tags` (many-to-many) - відсутні індекси

**Проблема**: Може не мати індексів на `usersId` та `tagsId`.

**Рішення**: Додати індекси (вже в міграції ✅):
```sql
CREATE INDEX idx_users_tags_user ON users_tags_tags(usersId, tagsId);
CREATE INDEX idx_users_tags_tag ON users_tags_tags(tagsId);
```

**Статус**: ✅ Вже вирішено в міграції

---

### 16. Таблиця `partnership_activities` - відсутні індекси

**Проблема**: Може не мати індексів на `userId`, `partnershipId`, `activity`.

**Використання**:
- `src/auth/auth.service.ts:484-490` - пошук по `partnershipId`, `userId`, `activity`

**Рішення**: Додати індекси:
```sql
CREATE INDEX idx_partnership_activities_user ON partnership_activities(userId);
CREATE INDEX idx_partnership_activities_partnership ON partnership_activities(partnershipId);
CREATE INDEX idx_partnership_activities_user_partnership_activity ON partnership_activities(userId, partnershipId, activity);
```

---

### 17. Таблиця `partner_user_links` - відсутні індекси

**Проблема**: Може не мати індексів на `userId`, `partnershipId`.

**Використання**:
- `src/auth/auth.service.ts:465-470` - пошук по `partnershipId`, `partnerUserId`

**Рішення**: Перевірити чи є UNIQUE індекс (вже є в міграції ✅):
```sql
CREATE UNIQUE INDEX IDX_044145bbf9a1623aaf0028441e ON partner_user_links(partnershipId, partnerUserId);
CREATE INDEX idx_partner_user_links_user ON partner_user_links(userId);
```

**Статус**: Потрібно перевірити в БД

---

## 📊 Пріоритети виправлення:

### НЕГАЙНО:
1. ✅ Індекси на `likes` (вже в міграції)
2. ✅ Індекси на `viewed_posts` (вже в міграції)
3. ✅ Індекси на `users_tags_tags` (вже в міграції)
4. ⚠️ Індекси на `activity` (критично для продуктивності)
5. ⚠️ Перевірити індекси на `posts.tagId`, `posts.userId`

### ШВИДКО:
6. UNIQUE індекс на `users.email`
7. Індекси на `partnership_activities`
8. Індекси на `posts.is_delivered`
9. CHECK constraint на `users.points >= 0`

### ПОТІМ:
10. Змінити `contests.tagId` на `SET NULL`
11. CHECK constraint на `contests.reward >= 0`
12. CHECK constraint на `contests.start_time < end_time`
13. NOT NULL для `posts.generation_params` з default

---

## 🔍 Як перевірити поточний стан:

```sql
-- Перевірити всі індекси на таблиці
SHOW INDEX FROM likes;
SHOW INDEX FROM viewed_posts;
SHOW INDEX FROM activity;
SHOW INDEX FROM posts;
SHOW INDEX FROM users;

-- Перевірити foreign keys
SELECT 
  TABLE_NAME,
  CONSTRAINT_NAME,
  REFERENCED_TABLE_NAME,
  REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- Перевірити UNIQUE constraints
SELECT 
  TABLE_NAME,
  CONSTRAINT_NAME,
  COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND CONSTRAINT_NAME LIKE 'UNIQUE%' OR CONSTRAINT_NAME LIKE 'IDX%';
```

---

## 📝 SQL міграція для додаткових індексів:

```sql
-- Activity таблиця
CREATE INDEX idx_activity_to_user ON activity(to_user_id);
CREATE INDEX idx_activity_from_user ON activity(from_user_id);
CREATE INDEX idx_activity_contest ON activity(contest_id);
CREATE INDEX idx_activity_post ON activity(post_id);
CREATE INDEX idx_activity_createdAt ON activity(createdAt);
CREATE INDEX idx_activity_isRead ON activity(isRead);
CREATE INDEX idx_activity_to_user_read ON activity(to_user_id, isRead);
CREATE INDEX idx_activity_to_user_type ON activity(to_user_id, activityType);
CREATE INDEX idx_activity_to_user_created ON activity(to_user_id, createdAt);

-- Posts таблиця (якщо індекси відсутні)
CREATE INDEX idx_posts_tagId ON posts(tagId);
CREATE INDEX idx_posts_userId ON posts(userId);
CREATE INDEX idx_posts_delivered ON posts(is_delivered);
CREATE INDEX idx_posts_user_delivered ON posts(userId, is_delivered);

-- Users таблиця
CREATE UNIQUE INDEX idx_users_email ON users(email);

-- Partnership activities
CREATE INDEX idx_partnership_activities_user ON partnership_activities(userId);
CREATE INDEX idx_partnership_activities_partnership ON partnership_activities(partnershipId);
CREATE INDEX idx_partnership_activities_user_partnership_activity ON partnership_activities(userId, partnershipId, activity);

-- Partner user links
CREATE INDEX idx_partner_user_links_user ON partner_user_links(userId);
```

---

## ⚠️ Важливо:

1. **Перевірка перед додаванням**: Завжди перевіряти чи індекс вже існує перед створенням
2. **Вплив на INSERT/UPDATE**: Індекси сповільнюють запис, але для read-heavy додатку це прийнятно
3. **Моніторинг**: Після додавання індексів перевірити `EXPLAIN` для основних запитів


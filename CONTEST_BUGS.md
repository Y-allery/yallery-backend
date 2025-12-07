# 🔴 КРИТИЧНІ ПРОБЛЕМИ В ЛОГІЦІ КОНТЕСТІВ

## 🚨 КРИТИЧНІ БАГИ

### 1. **participateInContest: Відсутня перевірка статусу контесту**
**Файл:** `src/contest/contest.service.ts:164-187`
**Проблема:** Користувач може приєднатися до закритого контесту або контесту, який ще не почався.

```typescript
// ПОТОЧНИЙ КОД (НЕБЕЗПЕЧНО):
async participateInContest(contestId: number, userId: number) {
  const contest = await this.contestRepository.findOne({...});
  // ❌ Немає перевірки contest.status === 'open'
  // ❌ Немає перевірки contest.startTime <= now <= contest.endTime
  contest.participants.push(user);
  await this.contestRepository.save(contest);
}
```

**Ризик:** 
- Користувачі можуть приєднуватися до закритих контестів
- Можливість приєднатися до контестів, які ще не почалися
- Проблеми з логікою нагородження

**Рішення:**
```typescript
if (contest.status !== ContestStatusEnum.OPEN) {
  throw new BadRequestException('Contest is not open for participation');
}

const now = new Date();
if (now < contest.startTime || now > contest.endTime) {
  throw new BadRequestException('Contest is not active at this time');
}
```

---

### 2. **updateContestStatuses: Memory leak - завантаження всіх користувачів**
**Файл:** `src/contest/contest.service.ts:336-339`
**Проблема:** Завантажує ВСІХ користувачів з deviceTokens в пам'ять для кожного контесту.

```typescript
// ПОТОЧНИЙ КОД (НЕБЕЗПЕЧНО):
const users = await this.userRepository.find({
  where: { is_deleted: false, emailVerified: true },
  relations: { deviceTokens: true }, // ❌ Завантажує всіх користувачів
});
```

**Ризик:**
- При 10,000+ користувачів = витік пам'яті
- Повільна робота cron job
- Можливий crash сервера

**Рішення:** Використовувати пагінацію або batch обробку:
```typescript
const BATCH_SIZE = 100;
let offset = 0;
while (true) {
  const users = await this.userRepository.find({
    where: { is_deleted: false, emailVerified: true },
    relations: { deviceTokens: true },
    take: BATCH_SIZE,
    skip: offset,
  });
  
  if (users.length === 0) break;
  
  // Обробити batch
  offset += BATCH_SIZE;
}
```

---

### 3. **updateContestStatuses: Некоректний підрахунок postsCount**
**Файл:** `src/contest/contest.service.ts:324,344`
**Проблема:** Використовує `contest.posts.length`, але posts завантажені через `loadRelationIds`, що повертає масив ID, а не об'єкти.

```typescript
// ПОТОЧНИЙ КОД (НЕБЕЗПЕЧНО):
loadRelationIds: { relations: ['posts'], disableMixedMap: true },
// ...
const postsCount = contest.posts.length; // ❌ Може бути некоректно
```

**Ризик:** Неправильний підрахунок постів може призвести до некоректної логіки закриття контестів.

**Рішення:**
```typescript
const postsCount = await this.postRepository.count({
  where: { 
    contest: { id: contest.id },
    is_published: true,
    is_blocked: false,
    is_rejected: false,
  },
});
```

---

### 4. **updateContestStatuses: Race condition при одночасних оновленнях**
**Файл:** `src/contest/contest.service.ts:343-479`
**Проблема:** Відсутня транзакційність та блокування при оновленні статусів.

**Ризик:** 
- Два cron jobs можуть одночасно оновити один контест
- Можливі дубльовані нотифікації
- Конфлікти при збереженні

**Рішення:** Використовувати транзакції та optimistic locking:
```typescript
await this.contestRepository.manager.transaction(async (manager) => {
  const contest = await manager.findOne(ContestEntity, {
    where: { id: contestId },
    lock: { mode: 'pessimistic_write' },
  });
  // Оновити статус
  await manager.save(contest);
});
```

---

### 5. **getPostsByContest: SQL Injection ризик**
**Файл:** `src/contest/contest.service.ts:234,260`
**Проблема:** Використовується інтерполяція `userId` безпосередньо в SQL.

```typescript
// ПОТОЧНИЙ КОД (НЕБЕЗПЕЧНО):
CASE 
  WHEN EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ${userId}) 
  THEN TRUE 
  ELSE FALSE 
END AS is_liked,
```

**Ризик:** Хоча userId з JWT токену, все одно краще використовувати параметризовані запити.

**Рішення:**
```typescript
const baseQuery = `
  SELECT 
    ...
    CASE 
      WHEN EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ?) 
      THEN TRUE 
      ELSE FALSE 
    END AS is_liked,
  ...
`;

const [posts] = await Promise.all([
  this.postRepository.query(baseQuery, [contestId, userId, limit, offset]),
]);
```

---

### 6. **getMyContests: Фільтрує тільки OPEN контести**
**Файл:** `src/contest/contest.service.ts:106-140`
**Проблема:** Повертає тільки контести зі статусом OPEN, але користувач міг брати участь в закритих контестах.

```typescript
// ПОТОЧНИЙ КОД:
.andWhere('contest.status = :status', { status: ContestStatusEnum.OPEN })
```

**Ризик:** Користувач не бачить свої минулі контести (закриті, виграні).

**Рішення:** Прибрати фільтр по статусу або додати опціональний параметр:
```typescript
async getMyContests(userId: number, includeClosed: boolean = false) {
  const query = this.contestRepository
    .createQueryBuilder('contest')
    .where('user.id = :userId', { userId });
    
  if (!includeClosed) {
    query.andWhere('contest.status = :status', { status: ContestStatusEnum.OPEN });
  }
}
```

---

### 7. **updateContestStatuses: Дублювання нотифікацій**
**Файл:** `src/contest/contest.service.ts:354-430, 489-563`
**Проблема:** Логіка відправки нотифікацій дублюється в `updateContestStatuses()` і `sendContestStartNotifications()`.

**Ризик:** 
- Дублювання коду
- Складність підтримки
- Можливі невідповідності в логіці

**Рішення:** Винести в окремий метод і використовувати його в обох місцях.

---

### 8. **setAutomaticContestWinner: Відсутня обробка помилок API**
**Файл:** `src/contest/contest.service.ts:565-688`
**Проблема:** При помилці TweetScout API контест закривається без переможця, але помилка не логується в Sentry.

**Ризик:** 
- Втрата даних про помилки
- Неможливість відстежити проблеми з API

**Рішення:** Додати логування в Sentry:
```typescript
catch (error) {
  console.error(`❌ Error in automatic winner selection:`, error.message);
  // Додати в Sentry
  Sentry.captureException(error, {
    tags: { contestId: contest.id, contestType: contest.contestType },
  });
  // ...
}
```

---

### 9. **updateContestStatuses: Неефективна обробка нотифікацій**
**Файл:** `src/contest/contest.service.ts:483-485`
**Проблема:** Після оновлення контестів відправляються нотифікації ВСІМ користувачам, навіть якщо контест не змінився.

```typescript
// ПОТОЧНИЙ КОД:
users.map((user) => {
  this.notificationGateway.emitProfileUpdate(user.id.toString());
});
```

**Ризик:** 
- Зайві WebSocket повідомлення
- Навантаження на сервер
- Погіршення UX

**Рішення:** Відправляти тільки користувачам, які беруть участь в оновлених контестах.

---

### 10. **setContestWinner: Відсутня перевірка чи пост належить контесту**
**Файл:** `src/contest/contest.service.ts:834-926`
**Проблема:** Перевірка `contest: { id: contest_id }` може не спрацювати правильно.

**Ризик:** Можливість встановити переможцем пост з іншого контесту.

**Рішення:** Додати явну перевірку:
```typescript
if (post.contest?.id !== contest_id) {
  throw new BadRequestException('Post does not belong to this contest');
}
```

---

## ⚠️ ВИСОКИЙ ПРІОРИТЕТ

### 11. **updateContestStatuses: Відсутня обробка помилок в циклі**
**Файл:** `src/contest/contest.service.ts:343-479`
**Проблема:** Якщо один контест викине помилку, весь cron job зупиниться.

**Рішення:**
```typescript
for (let contest of contests) {
  try {
    // Логіка оновлення
  } catch (error) {
    console.error(`Error processing contest ${contest.id}:`, error);
    Sentry.captureException(error, { tags: { contestId: contest.id } });
    continue; // Продовжити з наступним контестом
  }
}
```

---

### 12. **Cron job: Відсутній lock для запобігання паралельному виконанню**
**Файл:** `src/contest/contest.controller.ts:100-107`
**Проблема:** Якщо попередній cron job ще виконується, новий може запуститися паралельно.

**Ризик:** 
- Дублювання нотифікацій
- Конфлікти при оновленні контестів
- Надмірне навантаження

**Рішення:** Використовувати Redis lock:
```typescript
@Cron(CronExpression.EVERY_10_MINUTES)
async handleContests() {
  const lockKey = 'contest:update:lock';
  const lock = await redisClient.set(lockKey, '1', { EX: 600, NX: true });
  
  if (!lock) {
    console.log('Contest update already in progress, skipping...');
    return;
  }
  
  try {
    await this.contestService.updateContestStatuses();
  } catch (error) {
    console.error(`❌ Cron job error:`, error.message);
  } finally {
    await redisClient.del(lockKey);
  }
}
```

---

### 13. **setAutomaticContestWinner: Відсутня валідація даних з API**
**Файл:** `src/contest/contest.service.ts:573-608`
**Проблема:** Не перевіряє валідність відповіді від TweetScout API перед обробкою.

**Рішення:** Додати валідацію:
```typescript
if (!response.data || !Array.isArray(response.data.tweets)) {
  throw new Error('Invalid API response format');
}
```

---

## 🟡 СЕРЕДНІЙ ПРІОРИТЕТ

### 14. **participateInContest: Відсутня транзакційність**
**Проблема:** Якщо save() не вдасться, користувач може бути доданий до participants, але не збережений.

**Рішення:** Використовувати транзакції.

---

### 15. **updateContestStatuses: Неефективний запит для postsCount**
**Проблема:** Для кожного контесту виконується окремий запит для підрахунку постів.

**Рішення:** Використовувати один запит з GROUP BY для всіх контестів.

---

### 16. **getMyContests: Відсутня пагінація**
**Проблема:** Може повернути дуже багато контестів для активних користувачів.

**Рішення:** Додати пагінацію.

---

## 📋 ПЛАН ВИПРАВЛЕННЯ

### Крок 1 (КРИТИЧНО - ВИПРАВЛЕНО):
1. ✅ Додати перевірку статусу в participateInContest
2. ✅ Виправити підрахунок postsCount (використовує count запит)
3. ✅ Додати SQL injection захист (параметризовані запити)
4. ✅ Додати обробку помилок в циклі updateContestStatuses
5. ✅ Виправити getMyContests (прибрано фільтр по OPEN)

### Крок 2 (ВИСОКИЙ - ВИПРАВЛЕНО):
6. ✅ Додати Redis lock для cron job (створено RedisService)
7. ✅ Створено RedisService для централізованого управління

### Крок 3 (СЕРЕДНІЙ - ЗАЛИШИЛОСЬ):
8. ⏳ Оптимізувати завантаження користувачів (пагінація) - потребує рефакторингу
9. ⏳ Додати транзакції для критичних операцій
10. ⏳ Додати пагінацію в getMyContests


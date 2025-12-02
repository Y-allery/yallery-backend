# Критичні проблеми в логіці коду

## 🔴 КРИТИЧНІ ПРОБЛЕМИ (високий ризик падіння)

### 1. **Race Condition з Credits (найбільша проблема)**

**Місце:** `src/image-generation/image-generation.service.ts:976-996`

**Проблема:**
```typescript
async updateUserCredits(user: UserEntity, dto: GenerateImageDto | EditImageDto) {
  // ...
  user.points -= cost;  // ❌ НЕ АТОМАРНА ОПЕРАЦІЯ
  await this.userEntity.save(user);
}
```

**Чому це критично:**
- Якщо користувач одночасно запускає 2+ генерації, обидві можуть прочитати однаковий баланс
- Обидві спробують списати credits, але реально списаться тільки одна сума
- Результат: користувач може згенерувати більше, ніж має credits

**Приклад race condition:**
1. User має 100 credits, потрібно 50 за генерацію
2. Запит 1: читає 100 credits → списує 50 → залишається 50
3. Запит 2 (одночасно): читає 100 credits → списує 50 → залишається 50
4. Результат: має бути 0, але залишилося 50

**Рішення:** Використати атомарну операцію `decrement()` або транзакцію з `SELECT FOR UPDATE`

---

### 2. **Неправильний порядок операцій в Queue Processors**

**Місце:** Всі queue processors (`flux.queue.processor.ts`, `aura.queue.processor.ts`, тощо)

**Проблема:**
```typescript
async process(job: Job) {
  // 1. Генеруємо зображення
  const { generatedImages } = await this.imageGenerationService.generateFalAi(createPostDto);
  
  // 2. Зберігаємо пости в БД
  const data = await this.imageGenerationService.saveGeneratedImages(...);
  
  // 3. Списуємо credits ПОСЛЕ збереження
  await this.imageGenerationService.updateUserCredits(user, createPostDto);
  
  // 4. Відправляємо нотифікацію
  await this.imageGenerationService.notifyUserOfImageGeneration(+userId);
}
```

**Чому це критично:**
- Якщо після збереження постів станеться помилка (наприклад, падіння БД), credits вже будуть списані
- Але пости вже збережені, тому користувач втратить credits без результату
- Якщо помилка в `notifyUserOfImageGeneration`, credits все одно списуються

**Рішення:** 
- Списувати credits ДО генерації (або в транзакції разом зі збереженням)
- Або використати транзакцію для всього процесу

---

### 3. **Відсутність транзакцій для критичних операцій**

**Місце:** 
- `updateUserCredits()` - немає транзакції
- `calculateRefundCredits()` - немає транзакції
- `saveGeneratedImages()` - немає транзакції

**Проблема:**
```typescript
async calculateRefundCredits(userId: number, posts: number[], aiService: AIEnum) {
  const user = await this.userEntity.findOne({ where: { id: userId } });
  // ...
  const totalRefund = await this.getCostByService(aiService, posts.length);
  user.points += totalRefund;  // ❌ Може бути race condition
  await this.userEntity.save(user);
}
```

**Чому це критично:**
- Якщо одночасно відбувається списання credits і повернення, може статися неконсистентність
- При падінні БД після `save()` може бути часткове оновлення

**Рішення:** Обгорнути в транзакцію або використати атомарні операції

---

### 4. **Відсутність обробки помилок при списанні credits**

**Місце:** Queue processors не мають rollback для credits

**Проблема:**
Якщо генерація зображення падає, credits вже списані, але результат не отримано.

**Рішення:** 
- Списувати credits тільки після успішної генерації
- Або мати механізм повернення credits при помилці

---

## 🟡 СЕРЙОЗНІ ПРОБЛЕМИ (можуть призвести до проблем)

### 5. **Async методи викликаються без await (потенційно)**

**Місце:** Перевірити всі виклики `getCostByService` та `calculateTotalCost`

**Проблема:**
Після того, як ці методи стали async, можливо десь вони викликаються без `await`.

**Рішення:** Перевірити всі місця використання

---

### 6. **Відсутність валідації балансу після зміни цін**

**Місце:** `getCostByService()` тепер бере ціну з БД

**Проблема:**
- Якщо адмін змінить ціну в БД під час генерації, користувач може отримати іншу ціну, ніж очікував
- Credits перевіряються ДО додавання в чергу, але списуються ПІСЛЯ (може пройти час)

**Рішення:** 
- Зберігати ціну в job data
- Або перевіряти баланс знову перед списанням

---

### 7. **Проблема з `calculateRefundCredits` - немає перевірки на негативний баланс**

**Місце:** `src/image-generation/image-generation.service.ts:1226-1252`

**Проблема:**
```typescript
user.points += totalRefund;  // ❌ Може зробити баланс негативним, якщо була помилка
await this.userEntity.save(user);
```

**Рішення:** Додати валідацію

---

## 🟢 ПОТЕНЦІЙНІ ПРОБЛЕМИ (менший ризик)

### 8. **Відсутність обробки помилок в `getAISetting`**

**Місце:** `src/image-generation/image-generation.service.ts:55-59`

**Проблема:**
Якщо `aiSetting` не знайдено, метод повертає `null`, але не завжди є перевірка

**Рішення:** Додати перевірки скрізь, де використовується

---

### 9. **Високий concurrency в queue processors**

**Місце:** `concurrency: 60` в багатьох processors

**Проблема:**
При такій кількості одночасних операцій з credits можуть виникати race conditions

**Рішення:** Зменшити concurrency або додати блокування

---

## 📋 ПРІОРИТЕТИ ВИПРАВЛЕННЯ

1. **КРИТИЧНО:** Виправити race condition з credits (використати атомарні операції)
2. **КРИТИЧНО:** Змінити порядок операцій в queue processors (списувати credits до/в транзакції)
3. **ВАЖЛИВО:** Додати транзакції для операцій з credits
4. **ВАЖЛИВО:** Додати rollback credits при помилках генерації
5. **РЕКОМЕНДОВАНО:** Перевірити всі async виклики на наявність await
6. **РЕКОМЕНДОВАНО:** Додати валідацію балансу перед списанням

---

## 🔧 РЕКОМЕНДОВАНІ ЗМІНИ

### 1. Виправити `updateUserCredits` з атомарною операцією:

```typescript
async updateUserCredits(user: UserEntity, dto: GenerateImageDto | EditImageDto) {
  const cost = await this.calculateTotalCost(...);
  
  // Використати атомарну операцію
  await this.userEntity.decrement(
    { id: user.id },
    'points',
    cost
  );
  
  await this.notificationGateway.emitProfileUpdate(user.id.toString());
}
```

### 2. Змінити порядок в queue processors:

```typescript
async process(job: Job) {
  // 1. Перевірити баланс (вже зроблено перед додаванням в чергу)
  // 2. Списувати credits ДО генерації (або в транзакції)
  // 3. Генерувати зображення
  // 4. Зберігати пости
  // 5. Якщо помилка - повернути credits
}
```

### 3. Додати транзакцію для `saveGeneratedImages` + `updateUserCredits`:

```typescript
await this.dataSource.transaction(async (manager) => {
  // Зберегти пости
  // Списати credits
  // Якщо помилка - автоматичний rollback
});
```


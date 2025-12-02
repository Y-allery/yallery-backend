# AI Моделі та Ціни за Генерацію

## 📊 Моделі для Генерації Зображень

### 1. **AURA_FLOW** (Ideogram)
- **ID в системі:** `aura_flow`
- **Назва:** Ideogram
- **API модель:** `fal-ai/ideogram/v2`
- **Ціна:** 20 credits за зображення
- **Орієнтації:** horizontal, vertical
- **Кількість зображень:** 1-5
- **Макс. довжина промпту:** 1000 символів
- **Розміри:** 1024x1024, 1536x640, 768x1344
- **Опис:** Specializes in soft, atmospheric, dream-like imagery, perfect for ethereal landscapes and mood-based scenes.

### 2. **FLUX** (FLUX AI)
- **ID в системі:** `flux`
- **Назва:** FLUX AI
- **API модель:** `fal-ai/flux-pro/v1.1-ultra`
- **Ціна:** 30 credits за зображення
- **Орієнтації:** horizontal, vertical
- **Кількість зображень:** 1-5
- **Макс. довжина промпту:** 1000 символів
- **Розміри:** 1024x1024, 1536x640, 768x1344
- **Опис:** A versatile model for abstract art, surreal designs, and conceptual visuals.
- **Дефолтна модель:** Так (використовується як дефолт для старих постів)

### 3. **REALISTIC_VISION** (Realistic AI)
- **ID в системі:** `realistic_vision`
- **Назва:** Realistic AI
- **API модель:** `fal-ai/realistic-vision`
- **Ціна:** 11 credits за зображення
- **Орієнтації:** horizontal, vertical
- **Кількість зображень:** 1-5
- **Макс. довжина промпту:** 1000 символів
- **Розміри:** 1024x1024, 1536x640, 768x1344
- **Опис:** Excels in detailed, photorealistic images, including lifelike portraits and realistic environments

### 4. **FLUX_PRO_FINE_TUNE** (Flux PRO Fine Tune)
- **ID в системі:** `flux_pro_fine_tune`
- **Назва:** Flux PRO Fine Tune
- **API модель:** `fal-ai/flux-pro/v1.1-ultra-finetuned`
- **Ціна:** 100 credits за зображення
- **Орієнтації:** horizontal, vertical
- **Кількість зображень:** 1-2
- **Макс. довжина промпту:** 1000 символів
- **Розміри:** 1024x1024, 1536x640, 768x1344
- **Особливості:** Використовується для конкурсів з fine-tune моделями

### 5. **BYTEDANCE_EDIT** (Bytedance Edit)
- **ID в системі:** `bytedance_edit`
- **Назва:** Bytedance Edit
- **API модель:** `fal-ai/bytedance/seededit/v3/edit-image`
- **Ціна:** 25 credits за зображення
- **Орієнтації:** horizontal, vertical
- **Кількість зображень:** 1 (тільки редагування)
- **Макс. довжина промпту:** 1000 символів
- **Розміри:** 1024x1024, 1536x640, 768x1344
- **Особливості:** Використовується для редагування існуючих зображень

### 6. **X_ROUTER** (X-Router AI)
- **ID в системі:** `x_router`
- **Назва:** X-Router AI
- **API модель:** Використовує власний API (не fal.ai)
- **Ціна:** 25 credits за зображення
- **Орієнтації:** horizontal, vertical
- **Кількість зображень:** 1-4
- **Макс. довжина промпту:** 3000 символів
- **Розміри:** 512x512, 768x768, 1024x1024, 768x1024, 1024x768, 1024x1280, 1280x1024, 1344x768, 768x1344
- **Опис:** High-quality image generation with x402 payment integration, supports multiple resolutions, negative prompts, and reproducible results with seed values.
- **Особливості:** Підтримує negative prompts та seed values

---

## 🎥 Моделі для Генерації Відео

### 1. **BYTY_DANCE** (Bytedance Seedance)
- **ID в системі:** `byty_dance`
- **Назва:** Bytedance Seedance
- **API модель:** `fal-ai/bytedance/seedance/v1/lite/image-to-video`
- **Ціна:** 100 credits за відео
- **Функціонал:** Конвертує зображення в відео

---

## 💰 Таблиця Цін

| Модель | Ціна за одиницю | Мінімум | Максимум |
|--------|----------------|---------|----------|
| AURA_FLOW | 20 credits | 1 | 5 |
| FLUX | 30 credits | 1 | 5 |
| REALISTIC_VISION | 11 credits | 1 | 5 |
| FLUX_PRO_FINE_TUNE | 100 credits | 1 | 2 |
| BYTEDANCE_EDIT | 25 credits | 1 | 1 |
| X_ROUTER | 25 credits | 1 | 4 |
| BYTY_DANCE (відео) | 100 credits | 1 | 1 |

---

## 📍 Де визначаються ціни

### Основне місце (актуальне):
**Файл:** `src/image-generation/image-generation.service.ts`
**Метод:** `getCostByService(service: AIEnum, quantity: number = 1)`
**Рядки:** 1232-1243

```typescript
getCostByService(service: AIEnum, quantity: number = 1): number {
  const pricing = {
    [AIEnum.AURA_FLOW]: 20,
    [AIEnum.FLUX]: 30,
    [AIEnum.REALISTIC_VISION]: 11,
    [AIEnum.FLUX_PRO_FINE_TUNE]: 100,
    [AIEnum.BYTEDANCE_EDIT]: 25,
    [AIEnum.X_ROUTER]: 25,
  };
  return pricing[service] * quantity || 0;
}
```

### Застаріле місце (не використовується):
**Файл:** `src/common/helpers/get.dimension.func.ts`
**Метод:** `getCostByService(service: AIEnum)`
**Рядки:** 42-50

⚠️ **Увага:** Цей файл містить застарілі ціни і не використовується в основному коді!

---

## 🔧 Розрахунок загальної вартості

**Метод:** `calculateTotalCost(service: AIEnum, quantity: number)`
**Формула:** `ціна_за_одиницю * кількість`

Приклад:
- FLUX, 3 зображення = 30 * 3 = 90 credits
- REALISTIC_VISION, 5 зображень = 11 * 5 = 55 credits

---

## 📝 Примітки

1. **Дефолтна модель:** FLUX використовується як дефолтна для старих постів без generation_params
2. **Відео:** Всі відео коштують фіксовано 100 credits
3. **Редагування:** BYTEDANCE_EDIT використовується тільки для редагування існуючих зображень
4. **Fine-tune:** FLUX_PRO_FINE_TUNE використовується для конкурсів з кастомними моделями


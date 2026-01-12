#!/bin/bash
# Скрипт для виправлення помилки на сервері (dev і prod)

echo "=== Виправлення помилки на сервері ==="
echo ""

cd /root/yallery-backend

echo "1. Перевіряю поточну гілку..."
CURRENT_BRANCH=$(git branch --show-current)
echo "Поточна гілка: $CURRENT_BRANCH"
echo ""

echo "2. Оновлюю код..."
git fetch origin
if [ "$CURRENT_BRANCH" = "development" ]; then
    git reset --hard origin/development
elif [ "$CURRENT_BRANCH" = "main" ]; then
    git reset --hard origin/main
else
    echo "Невідома гілка: $CURRENT_BRANCH"
    exit 1
fi
echo ""

echo "3. Перевіряю структуру admin.service.ts..."
if grep -q "async broadcastNotification" src/admin/admin.service.ts; then
    echo "✅ Метод broadcastNotification знайдено"
    LINE_NUM=$(grep -n "async broadcastNotification" src/admin/admin.service.ts | cut -d: -f1)
    echo "   Метод на рядку: $LINE_NUM"
else
    echo "❌ Метод broadcastNotification не знайдено!"
    exit 1
fi
echo ""

echo "4. Видаляю старий dist..."
rm -rf dist
echo "✅ dist видалено"
echo ""

echo "5. Встановлюю залежності (якщо потрібно)..."
npm install --silent
echo ""

echo "6. Компілюю код..."
npm run build 2>&1 | tail -10
BUILD_EXIT_CODE=${PIPESTATUS[0]}
if [ $BUILD_EXIT_CODE -ne 0 ]; then
    echo "❌ Помилка компіляції!"
    exit 1
fi
echo ""

echo "7. Перевіряю скомпільований файл..."
if [ -f dist/src/admin/admin.service.js ]; then
    echo "✅ Файл скомпільований"
    
    # Перевіряю, чи метод всередині класу
    if grep -q "async broadcastNotification" dist/src/admin/admin.service.js; then
        echo "✅ Метод знайдено в скомпільованому файлі"
        
        # Перевіряю синтаксис
        if node -c dist/src/admin/admin.service.js 2>/dev/null; then
            echo "✅ Синтаксис правильний"
        else
            echo "❌ Помилка синтаксису в скомпільованому файлі!"
            exit 1
        fi
    else
        echo "❌ Метод не знайдено в скомпільованому файлі!"
        exit 1
    fi
else
    echo "❌ Файл не скомпільований!"
    exit 1
fi
echo ""

echo "8. Перезапускаю PM2..."
pm2 restart yallery-backend
echo ""

echo "9. Чекаю 3 секунди і перевіряю логи..."
sleep 3
pm2 logs yallery-backend --lines 15 --nostream

echo ""
echo "=== Готово! ==="


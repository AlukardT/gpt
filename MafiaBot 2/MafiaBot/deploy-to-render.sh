#!/bin/bash

echo "🚀 MafiaBot - Развертывание на Render"
echo "======================================"

# Проверка наличия git
if ! command -v git &> /dev/null; then
    echo "❌ Git не установлен. Установите git и попробуйте снова."
    exit 1
fi

# Проверка наличия Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не установлен. Установите Node.js и попробуйте снова."
    exit 1
fi

# Проверка версии Node.js
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Требуется Node.js версии 18 или выше. Текущая версия: $(node -v)"
    exit 1
fi

echo "✅ Проверки пройдены успешно"
echo ""

# Проверка статуса git
if [ -d ".git" ]; then
    echo "📁 Git репозиторий найден"
    CURRENT_BRANCH=$(git branch --show-current)
    echo "🌿 Текущая ветка: $CURRENT_BRANCH"
    
    # Проверка изменений
    if [ -n "$(git status --porcelain)" ]; then
        echo "⚠️  Обнаружены несохраненные изменения"
        echo "Хотите закоммитить изменения? (y/n)"
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            echo "💾 Коммит изменений..."
            git add .
            echo "Введите сообщение коммита:"
            read -r commit_message
            git commit -m "$commit_message"
        fi
    fi
else
    echo "📁 Git репозиторий не найден"
    echo "Хотите инициализировать git репозиторий? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        git init
        git add .
        git commit -m "Initial commit"
        echo "✅ Git репозиторий инициализирован"
    else
        echo "❌ Для развертывания на Render необходим git репозиторий"
        exit 1
    fi
fi

echo ""
echo "🔧 Настройка для Render:"
echo ""

# Проверка наличия .env файла
if [ ! -f ".env" ]; then
    echo "📝 Создание .env файла..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ .env файл создан из .env.example"
        echo "⚠️  Не забудьте отредактировать .env файл с вашими данными!"
    else
        echo "❌ Файл .env.example не найден"
        exit 1
    fi
fi

# Проверка package.json
if [ ! -f "package.json" ]; then
    echo "❌ package.json не найден"
    exit 1
fi

# Проверка render.yaml
if [ ! -f "render.yaml" ]; then
    echo "❌ render.yaml не найден"
    exit 1
fi

echo ""
echo "✅ Все файлы готовы для развертывания"
echo ""
echo "📋 Следующие шаги для развертывания на Render:"
echo ""
echo "1. 🚀 Запушите код в GitHub/GitLab репозиторий:"
echo "   git remote add origin <your-repo-url>"
echo "   git push -u origin main"
echo ""
echo "2. 🌐 Откройте [Render Dashboard](https://dashboard.render.com)"
echo ""
echo "3. 📦 Создайте новый Blueprint Instance:"
echo "   - Нажмите 'New +'"
echo "   - Выберите 'Blueprint'"
echo "   - Укажите URL вашего репозитория"
echo "   - Подтвердите создание"
echo ""
echo "4. ⏳ Дождитесь завершения развертывания"
echo ""
echo "5. 🔍 Проверьте работу:"
echo "   - Health check: https://your-app.onrender.com/health"
echo "   - Веб-интерфейс: https://your-app.onrender.com/balagan/"
echo ""
echo "🎉 Удачи с развертыванием!"
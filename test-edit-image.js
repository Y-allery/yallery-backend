const axios = require('axios');

// Тестовий JWT токен (потрібно замінити на реальний)
const JWT_TOKEN = 'YOUR_JWT_TOKEN_HERE';

async function testEditImage() {
  try {
    const response = await axios.post(
      'http://localhost:8000/image-generation/edit-image',
      {
        image_url: 'https://example.com/test-image.jpg',
        prompt: 'Make the background more colorful and add some flowers'
      },
      {
        headers: {
          'Authorization': `Bearer ${JWT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Edit image request successful:');
    console.log('Response:', response.data);
  } catch (error) {
    console.error('❌ Edit image request failed:');
    console.error('Status:', error.response?.status);
    console.error('Message:', error.response?.data);
  }
}

// Запуск тесту
testEditImage(); 
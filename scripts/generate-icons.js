const fs = require('fs');
const { createCanvas, registerFont } = require('canvas');

// Создаем папку public если её нет
if (!fs.existsSync('./public')) {
    fs.mkdirSync('./public', { recursive: true });
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

const colors = {
    background: '#2b2420',
    text: '#f5efe2',
    accent: '#e9c46a'
};

function createGlossaIcon(size) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Фон с закругленными углами
    const radius = size * 0.22;
    ctx.fillStyle = colors.background;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(size - radius, 0);
    ctx.quadraticCurveTo(size, 0, size, radius);
    ctx.lineTo(size, size - radius);
    ctx.quadraticCurveTo(size, size, size - radius, size);
    ctx.lineTo(radius, size);
    ctx.quadraticCurveTo(0, size, 0, size - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();

    // GLOSSA - основной текст
    const fontSize1 = size * 0.24;
    ctx.fillStyle = colors.text;
    ctx.font = `900 ${fontSize1}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GLOSSA', size / 2, size / 2 - size * 0.08);

    // Декоративная линия
    const lineY = size / 2 + size * 0.04;
    const lineWidth = size * 0.35;
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = size * 0.008;
    ctx.beginPath();
    ctx.moveTo(size / 2 - lineWidth / 2, lineY);
    ctx.lineTo(size / 2 + lineWidth / 2, lineY);
    ctx.stroke();

    // Подзаголовок
    const fontSize2 = size * 0.045;
    ctx.fillStyle = colors.text;
    ctx.font = `${fontSize2}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LANGUAGE · LITERATURE · CULTURE', size / 2, lineY + size * 0.08);

    return canvas;
}

// Генерируем иконки всех размеров
sizes.forEach(size => {
    const canvas = createGlossaIcon(size);
    const buffer = canvas.toBuffer('image/png');
    const filename = `public/icon-${size}x${size}.png`;
    fs.writeFileSync(filename, buffer);
    console.log(`✅ Generated ${filename}`);
});

console.log('🎉 Все иконки успешно созданы!');
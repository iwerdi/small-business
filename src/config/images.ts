/**
* ─────────────────────────────────────────────────────────────────────────────
* КОНФИГУРАЦИЯ ИЗОБРАЖЕНИЙ
* ─────────────────────────────────────────────────────────────────────────────
* Это единственный файл, который нужно редактировать при замене изображений-заполнителей
* на реальные фотографии клиента. Astro автоматически оптимизирует все локальные
* изображения во время сборки (конвертация в WebP/AVIF, создание srcset,
* установка размеров для предотвращения сдвигов макета — CLS). 
*
* КАК ДОБАВИТЬ СВОИ ИЗОБРАЖЕНИЯ
* ──────────────────────────
* 1. Поместите файл изображения в соответствующую папку внутри src/assets/images/
* 2. Раскомментируйте нужную строку импорта ниже и укажите правильное имя файла
* 3. Экспортируйте его — компонент подхватит его автоматически
*
* Поддерживаемые форматы: .jpg, .jpeg, .png, .webp, .avif
*
* СТРУКТУРА ПАПОК
* ────────────────
*   src/assets/images/
*     hero/      ← изображение для главного блока (Hero) на домашней странице
*     about/     ← изображение для раздела «О нас» и одноименной страницы
*     gallery/   ← фотографии проектов (сюда можно добавить любое количество файлов)
*
* Пока вы не добавите локальные файлы, компоненты будут использовать изображения-заполнители
* с сервиса Unsplash. Они подходят для этапа разработки или демонстрации, но
* НЕ оптимизируются средствами Astro. Обязательно замените их на локальные файлы
* перед запуском сайта. 
* ─────────────────────────────────────────────────────────────────────────────
*/

import type { ImageMetadata } from 'astro';

// ── Hero ──────────────────────────────────────────────────────────────────────
// Рекомендуется: альбомная ориентация, размер не менее 1600 × 1200 пикселей.
// Для замены: замените файл в папке src/assets/images/hero/ и обновите название файла.
import heroImage from '../assets/images/hero/hero.jpg';
export { heroImage };

// ── Раздел «О нас» ──────────────────────────────────────────────────────────────
// Рекомендуется: портретная ориентация или квадрат, размер — не менее 900 × 700 пикселей.
// Для использования: поместите файл в папку src/assets/images/about/, затем раскомментируйте
// приведенный ниже импорт, укажите имя вашего файла и измените экспорт на: export { aboutImage };
//
import aboutImage from '../assets/images/about/team.jpg';
export const aboutImage: ImageMetadata | undefined = undefined;
// закомментируйте строку выше и раскомментируйте строку ниже, чтобы использовать собственное изображение
// export { aboutImage };

// ── Галерея — автоматическое обнаружение ───────────────────────────────────────
// Добавьте любое количество изображений в папку src/assets/images/gallery/ —
// они автоматически появятся в галерее, менять код не потребуется.
//
// Имя файла будет использоваться в качестве альтернативного текста (alt):
//   kitchen-remodel.jpg    → «Kitchen Remodel»
//   deck-installation.jpg  → «Deck Installation»
//
// Рекомендуется: альбомная ориентация, размер каждого изображения — не менее 800 × 600 пикселей.
// Старайтесь придерживаться единых пропорций (для сетки галереи лучше всего подходят пропорции 4:3).

export interface GalleryImage {
  src: ImageMetadata | string;
  alt: string;
}

const discovered = Object.entries(
  import.meta.glob<{ default: ImageMetadata }>(
    '../assets/images/gallery/*.{jpg,jpeg,png,webp,avif}',
    { eager: true },
  ),
).map(([path, mod]): GalleryImage => ({
  src: mod.default,
  alt: path
    .split('/').pop()!
    .replace(/\.[^.]+$/, '')        // удалить расширение
    .replace(/[-_]/g, ' ')          // дефисы/нижние подчеркивания → пробелы
    .replace(/\b\w/g, (c) => c.toUpperCase()), // Заглавные буквы в начале слов
}));

// Заполнители из Unsplash используются, когда папка галереи пуста.
// Добавьте свои изображения — заполнители будут удалены автоматически.
const placeholders: GalleryImage[] = [
  { src: 'https://images.unsplash.com/photo-1772567732969-c1506edf80a0?w=600&q=80', alt: 'Completed kitchen renovation' },
  { src: 'https://images.unsplash.com/photo-1523413363574-c30aa1c2a516?w=600&q=80', alt: 'Bathroom remodel with modern fixtures' },
  { src: 'https://images.unsplash.com/photo-1761166518480-49279513d65f?w=600&q=80', alt: 'Fresh landscaping and walkway installation' },
  { src: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&q=80', alt: 'Interior painting and trim work' },
  { src: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&q=80', alt: 'Electrical panel upgrade' },
  { src: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&q=80', alt: 'Deck construction and staining' },
];

export const galleryImages: GalleryImage[] = discovered.length > 0 ? discovered : placeholders;

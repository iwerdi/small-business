import { config, fields, collection } from '@keystatic/core';

export default config({
  storage: import.meta.env.PROD
  ? { kind: 'github', repo: { owner: 'iwerdi', name: 'small-business' } }
  : { kind: 'local' },

  ui: {
    brand: { name: 'ГАРАЖ PRO' },
  },

  collections: {
    blog: collection({
      label: 'Блог',
      slugField: 'title',
      path: 'src/content/blog/*',
      format: { contentField: 'content' },
      schema: {
        title: fields.slug({ name: { label: 'Заголовок' } }),
        description: fields.text({
          label: 'Описание (для списка и SEO)',
          multiline: true,
          validation: { isRequired: true },
        }),
        author: fields.text({ label: 'Автор', defaultValue: 'Команда' }),
        date: fields.date({
          label: 'Дата публикации',
          validation: { isRequired: true },
        }),
        tags: fields.array(fields.text({ label: 'Тег' }), {
          label: 'Теги',
          itemLabel: (props) => props.value,
        }),
        draft: fields.checkbox({
          label: 'Черновик (не показывать на сайте)',
          defaultValue: false,
        }),
        content: fields.markdoc({
          label: 'Текст статьи',
          options: {
            // Картинки из редактора кладём туда же, где лежат текущие (/assets/images/blog/...)
            image: {
              directory: 'public/assets/images/blog',
              publicPath: '/assets/images/blog/',
            },
          },
        }),
      },
    }),
  },
});

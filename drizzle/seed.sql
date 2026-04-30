-- Seed data: 4 categories + 1 demo article so the frontend renders something
-- meaningful before the automation script publishes real content.
--
-- Idempotent: uses INSERT OR IGNORE so re-running is safe.

INSERT OR IGNORE INTO categories (slug, name, description, parent_slug) VALUES
  ('ia-fundamentos', 'IA — Fundamentos', 'Conceitos essenciais sobre inteligência artificial e modelos de linguagem.', NULL),
  ('tutoriais', 'Tutoriais', 'Guias passo a passo para implementar tecnologias modernas.', NULL),
  ('arquitetura', 'Arquitetura', 'Decisões de design, padrões e infraestrutura para sistemas modernos.', NULL),
  ('novidades', 'Novidades', 'Lançamentos, atualizações e tendências do ecossistema de tecnologia.', NULL);

INSERT OR IGNORE INTO articles (
  id,
  slug,
  title,
  meta_title,
  meta_description,
  summary,
  content,
  category,
  tags,
  author_name,
  author_url,
  status,
  published_at,
  updated_at,
  created_at,
  indexnow_sent
) VALUES (
  '01HZZZ00000000000000DEMOAR1',
  'bem-vindo-ao-blog',
  'Bem-vindo ao Blog Exemplo',
  'Bem-vindo ao Blog Exemplo | Conteúdo sobre IA e Tecnologia',
  'Conheça o Blog Exemplo: por que ele existe, o que você vai encontrar aqui e como o conteúdo é organizado.',
  'Este é um blog dedicado a explicar conceitos de IA, desenvolvimento moderno e arquitetura de software de forma clara, direta e otimizada para ser citada por mecanismos de busca generativa como Google AI Overviews e ChatGPT Search.',
  '<h2>O que você vai encontrar aqui</h2><p>Este blog publica conteúdo organizado em quatro áreas principais: fundamentos de IA, tutoriais práticos, decisões de arquitetura e novidades do ecossistema. Cada artigo é escrito com um padrão estrutural que prioriza respostas diretas, exemplos concretos e contexto suficiente para que tanto leitores humanos quanto sistemas de IA generativa possam extrair valor.</p><h2>Como o conteúdo é estruturado</h2><p>Todo artigo segue o mesmo padrão: um resumo de uma a duas frases logo abaixo do título, seguido por seções organizadas em perguntas e respostas. Esse formato é otimizado para os algoritmos modernos de busca generativa.</p><h3>Por que esse formato funciona</h3><ul><li><strong>Resumo no topo:</strong> é o trecho mais provável de ser citado por AI Overviews.</li><li><strong>Subtítulos como perguntas:</strong> casam diretamente com a forma como as pessoas pesquisam.</li><li><strong>Listas e tabelas:</strong> facilitam extração de dados estruturados.</li><li><strong>Links internos:</strong> mostram contexto e profundidade de cobertura.</li></ul><h2>Stack técnico</h2><p>Este blog roda em Astro com Cloudflare Workers e D1, com publicação via API. O foco é performance (TTFB sub-100ms na edge), SEO técnico impecável e zero JavaScript desnecessário no cliente.</p><p>Os próximos artigos vão entrar em mais detalhes sobre cada uma dessas áreas. Use o campo de busca acima ou navegue pelas categorias para explorar.</p>',
  'novidades',
  '["lancamento","blog","seo","aio"]',
  'Equipe Editorial',
  'https://www.exemplo.com.br/equipe',
  'published',
  '2026-04-16T00:00:00.000Z',
  '2026-04-16T00:00:00.000Z',
  '2026-04-16T00:00:00.000Z',
  1
);

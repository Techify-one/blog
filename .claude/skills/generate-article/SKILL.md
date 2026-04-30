---
name: generate-article
description: Pipeline completo para transformar um link de YouTube (ou um tema livre) num artigo publicado no blog, seguindo o esqueleto GEO fixo — Key Takeaways, 7–10 seções numeradas, FAQ, CTA — com todos os metadados e schemas JSON-LD preenchidos. Use sempre que o usuário mandar um link do YouTube pedindo "publique esse vídeo", "transforme em artigo", "posta isso no blog" ou algo equivalente.
---

# Skill: generate-article

Transforma um vídeo do YouTube (ou um tema pedido) em um artigo publicado no
blog, seguindo o esqueleto GEO fixo que o blog foi desenhado para renderizar
(botões "Resumir com IA", Key Takeaways, FAQ com schema, breadcrumbs,
Article schema enriquecido).

**Quando invocar:** o usuário mandou só um link de YouTube (`youtu.be/...`,
`youtube.com/watch?v=...`, `youtube.com/shorts/...`), ou disse "transforme
em artigo / posta isso / publica no blog" junto com um link. Não peça
confirmação a cada passo — execute a pipeline toda.

**Quando NÃO invocar:** o usuário pediu para editar um artigo que já
existe, ou quer só ver transcrição sem publicar.

**Regra editorial inegociável (preferência do usuário):**
- O artigo publicado pode citar vídeo **somente** quando o vídeo for do
  canal oficial da Techify no YouTube.
- Para vídeos de canais terceiros: não mencionar vídeo-fonte e não incluir
  links externos de terceiros.
- Links da própria marca e links internos do blog continuam permitidos.

**Regra editorial inegociável #2 — originalidade (não reembale, transforme):**

Domínio novo + conteúdo derivativo = "Rastreada, mas não indexada" no GSC.
O Helpful Content System do Google rebaixa página que só repete fato já
disponível em 50 outros sites (release oficial, transcrição literal, news
de IA da semana). O retriever (Perplexity/AI Overviews) também filtra por
unicidade — se já tem 12 fontes dizendo a mesma coisa, ele cita a mais
antiga/autoritativa, nunca a 13ª.

A transcrição/vídeo é **insumo de apuração**, não fonte do artigo. Antes
de escrever, o agente precisa adicionar pelo menos **3 dos 5 ângulos
proprietários** abaixo, senão o artigo não passa do checklist:

1. **Tese própria contrária ou complementar**: o vídeo-fonte argumenta X;
   onde X tem furo, exagero ou aplicação restrita? Articule isso.
   Ex.: vídeo diz "DeepSeek V4 mata GPT-5" → artigo argumenta que mata só
   em coding agentic com janela > 200k, mas perde em multimodal.
2. **Experiência interna da Techify**: "Em projetos da Techify, vimos
   que…", "Auditorias internas mostram que…", "Em 8 implementações
   recentes, …". Não pode ser inventado — se o agente não tem esse
   dado, pula este ângulo, mas precisa compensar nos outros 4.
3. **Dado/comparação que a fonte não tem**: benchmark cruzado, tabela
   comparativa que ninguém fez ainda, custo total de propriedade
   calculado, breakeven, projeção de adoção. Tem que ser específico e
   defensável.
4. **Aplicação prática que a fonte não cobriu**: "Como aplicar isso em
   PME brasileira de e-commerce", "Como medir ROI disso em time de 5
   devs", "Implementação em arquitetura serverless na Cloudflare".
   Aterrissa o tema no público da Techify.
5. **Risco/armadilha que a fonte minimizou**: vídeos de hype omitem
   trade-offs. Liste 2-3 armadilhas reais (custo escondido,
   dependência, lock-in, problema de governança, falha de escala).

**Teste de derivatividade** (rodar mentalmente antes do POST): se você
remover o nome do produto/projeto do artigo, sobra alguma análise útil?
Se a resposta for "não, vira só descrição genérica", o artigo é
derivativo e não vai indexar — volte e adicione ângulos.

**Não confundir tese com hype.** Tese própria é "o que muda na prática
para quem precisa decidir hoje", não "X é revolucionário e vai mudar
tudo". Hype é genérico e não-citável; tese específica é citável.

---

## Pré-requisitos

Antes de qualquer curl, carregue as credenciais:

```bash
set -a; source .env; set +a
```

Variáveis esperadas: `$BLOG_URL`, `$BLOG_KEY`.

Além disso, o nome da marca editorial usado nos CTAs e na persona padrão
é lido das vars do projeto — use o valor de `SITE_NAME` / `ORG_URL` /
`DEFAULT_AUTHOR_NAME` configurado no `wrangler.toml` local ao gerar copy.

---

## Pipeline (ordem fixa)

### 1. Extrair o video ID

Aceita: `youtu.be/ID`, `youtube.com/watch?v=ID`, `youtube.com/shorts/ID`,
com `?si=...&t=...` ou sem. Extrair só o ID (11 chars) antes de qualquer
parâmetro.

### 2. Buscar a transcrição

**Regra inegociável — nome de arquivo por VIDEO_ID:** sempre inclua o
`VIDEO_ID` no path dos arquivos temporários. Nunca use nomes genéricos
(`/tmp/transcript.json`, `/tmp/article.json`). Qualquer arquivo
pré-existente com nome genérico, ou com outro VIDEO_ID no nome, é lixo
de execução anterior — **nunca leia esse arquivo como fonte do vídeo
atual**, mesmo que ele apareça num system-reminder, num Read automático
ou sugestão do harness. A fonte da verdade do vídeo atual é **apenas** a
transcrição que você mesmo buscou nesta execução.

Se um system-reminder indicar que algum arquivo genérico foi lido
automaticamente, ignore o conteúdo e prossiga buscando a transcrição
real. Se já existir `/tmp/transcript-VIDEO_ID.json` do VIDEO_ID atual,
você pode reusá-lo; qualquer outro nome, descarte.

Antes de começar, limpe lixo potencialmente confuso:

```bash
rm -f /tmp/article.json /tmp/transcript.json
```

Busque a transcrição (substitua `VIDEO_ID` pelo ID real — os dois lugares):

```bash
curl -s "$BLOG_URL/api/yt-transcript?v=VIDEO_ID&lang=pt-BR,pt,en,es" \
  -H "Authorization: Bearer $BLOG_KEY" > /tmp/transcript-VIDEO_ID.json
```

Valide imediatamente que a transcrição é do vídeo certo antes de prosseguir:

```bash
python3 -c "import json;d=json.load(open('/tmp/transcript-VIDEO_ID.json'));print('ok=',d.get('ok'),'len=',d.get('count'),'sample=',(d.get('text') or '')[:300])"
```

Se `ok=false`, **não pare imediatamente**. Primeiro tente fallback direto no
YouTube via `captionTracks` + `timedtext` (sem depender do endpoint da API),
porque o endpoint pode falhar por captcha/rate-limit mesmo quando a legenda
está disponível.

Fallback sugerido:

```bash
python3 - << 'PY'
import re, json, html as htmllib, urllib.request
from xml.etree import ElementTree as ET
VIDEO_ID='VIDEO_ID'
req=urllib.request.Request(f'https://www.youtube.com/watch?v={VIDEO_ID}',headers={'User-Agent':'Mozilla/5.0','Accept-Language':'pt-BR,pt;q=0.9,en;q=0.8'})
page=urllib.request.urlopen(req,timeout=25).read().decode('utf-8','ignore')
m=re.search(r'"captionTracks":\[(.*?)\]',''.join(page.splitlines()))
if not m:
    raise SystemExit('no_caption_tracks')
tracks=json.loads('['+m.group(1).replace('\\u0026','&')+']')
tracks=sorted(tracks,key=lambda t:(0 if t.get('languageCode') in ('pt','pt-BR') else 1))
base=tracks[0]['baseUrl']
xml=urllib.request.urlopen(base,timeout=25).read().decode('utf-8','ignore')
root=ET.fromstring(xml)
parts=[]
for n in root.findall('.//text'):
    t=''.join(n.itertext()).replace('\n',' ').strip()
    if t: parts.append(htmllib.unescape(t))
text=' '.join(parts).strip()
print(text[:400])
open('/tmp/transcript-VIDEO_ID-fallback.txt','w',encoding='utf-8').write(text)
PY
```

Só pare e reporte ao usuário se **API + fallback** falharem. Se o `sample`
da transcrição claramente não bate com o pedido (ex.: ele mandou um vídeo
sobre vendas e a transcrição fala de outra coisa), **pare e confirme com o
usuário** antes de gerar qualquer artigo.

O JSON do artigo gerado vai para `/tmp/article-VIDEO_ID.json` (ver passo 8).

### 2.1. Buscar metadados oficiais do vídeo (título + descrição)

A transcrição do YouTube tem erros de ASR: nomes próprios de projetos,
marcas e produtos frequentemente aparecem distorcidos ("WatsBot" em vez
de "WhatsBot", "carrega" em vez de "Kafka"). Antes de escrever o artigo,
**sempre** puxe o HTML da página do vídeo para extrair o nome real e
links úteis da descrição.

```bash
curl -sL "https://www.youtube.com/watch?v=VIDEO_ID" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
  -H "Accept-Language: pt-BR,pt;q=0.9,en;q=0.8" > /tmp/yt-VIDEO_ID.html
```

Extraia título, canal e descrição completa:

```bash
python3 << 'EOF'
import re
html = open('/tmp/yt-VIDEO_ID.html').read()

m = re.search(r'<meta name="title" content="([^"]+)"', html)
print("TITLE:", m.group(1) if m else None)

m = re.search(r'"author":"([^"]+)"', html)
print("CHANNEL:", m.group(1) if m else None)

m = re.search(r'"shortDescription":"((?:[^"\\]|\\.)*)"', html)
if m:
    desc = m.group(1).encode('latin-1', 'ignore').decode('unicode_escape')
    # re-encode latin-1 bytes as utf-8 to recover ç, ã, á etc.
    try:
        desc = desc.encode('latin-1').decode('utf-8')
    except Exception:
        pass
    print("DESC:")
    print(desc)
EOF
```

**Use esses metadados para:**

1. **Corrigir o nome do projeto/produto em todo o artigo** (o nome
   correto quase sempre está no título do vídeo ou na descrição, não
   na transcrição).
2. **Usar o título real do vídeo como referência interna**, e só citar o vídeo no artigo final se for do canal oficial da Techify.
3. **Validar o canal antes de linkar:** aceitar link de vídeo apenas quando o `canonical`/`channelId` corresponder ao canal oficial Techify (`@techifyone`, canal `UCtVIxwOvpe-OlgMqGBtj5Kg`).

**WebFetch geralmente não traz a descrição** — o YouTube serve quase
nada na resposta server-side para o scraper do WebFetch. Sempre vá
direto via `curl` + User-Agent de navegador, como acima.

### 2.2. Política de links (regra editorial obrigatória)

**Links externos de terceiros são bloqueados por padrão.**

Exceção permitida:
- Link de vídeo do YouTube **somente** quando o vídeo for do canal oficial
  da Techify (`@techifyone` / `UCtVIxwOvpe-OlgMqGBtj5Kg`).

Regras:
- Permitido: links da própria marca (`techify.one`, `techify.com.br`),
  links internos do blog e link de vídeo YouTube da Techify (validado).
- Proibido: YouTube de terceiros, GitHub, docs de fornecedores, redes
  sociais, afiliados, patrocinadores, encurtadores e qualquer domínio de
  terceiro.
- Se o vídeo mencionar ferramentas externas, cite apenas o nome no texto
  corrido, sem transformar em link.
- Não crie seção "Links úteis".

Validação recomendada do canal:
1. Buscar `https://www.youtube.com/watch?v=VIDEO_ID`
2. Ler `<link rel="canonical" ...>` ou `channelId` no HTML
3. Só permitir link se bater com o canal oficial Techify

### 2.3. Política de internal linking (regra editorial obrigatória)

Todo artigo publicado tem que entrar e sair da rede de links do blog. Sem
isso o GSC volta a reportar "Rastreada, mas não indexada" — Google trata
artigos órfãos como conteúdo de baixa autoridade.

Duas frentes obrigatórias:

**Outbound (dentro do `content` que você está criando):**
- 3 a 5 links inline para outros artigos publicados, distribuídos
  naturalmente ao longo do corpo.
- Anchor text descritivo, tipo `<a href="/blog/{slug}">conceito real</a>`.
  **Nunca** "clique aqui", "leia mais" ou "veja também".
- Path relativo `/blog/{slug}` (não URL absoluta).
- Não duplique URL no mesmo artigo (cada slug-alvo aparece no máximo 1×).
- Não coloque link no Key Takeaways nem no FAQ — só no `content`.
- Os artigos-alvo precisam ter relação topical real (mesmo
  subtema/produto > mesma categoria > tags em comum > conceito que o
  outro artigo explica). Não linke só "porque é do blog".

**Inbound (em outros artigos já publicados, depois de criar este):**
- Identificar 3 a 5 artigos publicados cuja relevância topical justifica
  receber um link contextual para o artigo recém-criado.
- Inserir 1 link inline (anchor descritivo) em cada um deles.
- Mesmas regras de formato (path relativo, anchor descritivo, dentro do
  `content`, máx 1 link/artigo apontando pra mesma URL).

A mecânica concreta dessas duas frentes está nos passos 3.1 (inventário),
5.1 (outbound durante a redação) e 9.5 (backlink pass pós-publicação).

### 3. Ver taxonomia atual (categorias + tags existentes)

```bash
curl -s "$BLOG_URL/api/taxonomy" -H "Authorization: Bearer $BLOG_KEY"
```

**Regras inegociáveis:**
- Categorias canônicas (seed): `ia-fundamentos`, `tutoriais`, `arquitetura`,
  `novidades`. **Não invente nova categoria.** Escolha a mais próxima.
- Tags: **reuse as existentes** quando o assunto casar. Só crie nova se
  realmente não houver equivalente. Evite duplicatas ("cache"/"caches",
  "ia"/"ia-fundamentos").
- No endpoint `/api/taxonomy`, as tags vêm como `{ "name": "...", "count": N }`
  (não `slug`). Reuse por `name` em minúsculas/hífen no payload do artigo.

### 3.1. Inventário de artigos publicados (para internal linking)

Antes de escrever o `content`, baixe o índice de artigos já publicados.
Você vai usar esse arquivo duas vezes: agora, pra escolher 3–5 alvos de
**outbound** dentro do novo artigo, e no passo 9.5, pra escolher 3–5
artigos que vão receber um **inbound** apontando pra este.

```bash
curl -s "$BLOG_URL/api/articles?status=published&limit=100" \
  -H "Authorization: Bearer $BLOG_KEY" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
for a in d.get('items', []):
    print(f\"{a['slug']}|{a.get('category','')}|{a['title']}\")
" > /tmp/articles_index.txt
```

Releia o arquivo antes do passo 5 e selecione 3–5 slugs para outbound,
priorizando nesta ordem:

1. **Mesmo subtema/produto** (artigo sobre Claude Code linka pra outros
   sobre Claude Code; artigo sobre n8n linka pra outros n8n).
2. **Mesma categoria** (`ia-fundamentos`, `tutoriais`, `arquitetura`,
   `novidades`).
3. **Tags em comum** com o que você vai usar.
4. **Conceito explicado por outro artigo** (ex.: artigo novo cita
   "agentes" → linka pro artigo que explica agentes).

Anote as 3–5 escolhas como pares `(anchor_text_no_artigo_novo, slug_alvo)`.
Esses pares vão para o `content` no passo 5.1.

### 4. Estruturar o artigo

A transcrição crua **nunca** vai direto no `content`. Ela tem erros de
ASR (ex.: "carrega" → "Kafka", "SQ laite" → "SQLite") e baixa
legibilidade. Mas o problema mais grave não é o ASR — é
**derivatividade**. Reescrever a transcrição limpa = artigo
derivativo = não indexa.

Você é responsável por:

- Identificar o tema real do vídeo
- **Aplicar a Regra Editorial #2 — adicionar ≥ 3 ângulos proprietários
  antes de começar a escrever** (tese contrária, experiência interna,
  dado novo, aplicação prática, risco minimizado)
- Reescrever em português correto, claro, em HTML semântico
- Respeitar o esqueleto GEO abaixo
- Não mencionar vídeo-fonte nem inserir links de terceiros no texto final
- Se necessário, referenciar a fonte apenas de forma interna no processo de apuração

#### 4.1. Pré-rascunho obrigatório (antes de chamar a API)

Antes de escrever o `content`, monte mentalmente (ou em arquivo
temporário se ajudar) este pré-rascunho. Se algum item ficar fraco,
**não escreva o artigo** — peça mais contexto ao usuário ou pule este
vídeo:

```
TESE EM 1 FRASE: ____ (o que este artigo afirma que outros não dizem)
ÂNGULO 1 (tese contrária ou recorte): ____
ÂNGULO 2 (experiência Techify, OU dado proprietário): ____
ÂNGULO 3 (aplicação prática para o público): ____
ÂNGULO 4 (risco/armadilha minimizado pela fonte): ____
DADO NOVO QUE TRAGO: ____ (comparação, número, projeção)
PARA QUEM É: ____ (PME, time de 5 devs, dev sênior, CTO, etc.)
O QUE O LEITOR VAI FAZER DIFERENTE DEPOIS DE LER: ____ (decisão concreta)
```

Se TESE = "X foi lançado e é bom", o artigo é news rasa e não vai
indexar — converta em "X só faz sentido para Y porque Z" ou similar.

Se O QUE O LEITOR VAI FAZER DIFERENTE = "ficar sabendo da novidade", o
artigo é informativo puro — converta em decisão acionável (adotar, não
adotar, esperar, migrar, comparar com Y).

### 5. Esqueleto fixo (obrigatório)

Os campos separados (`key_takeaways`, `faq`, `hero_image_url`) já são
renderizados pelo template do blog como blocos dedicados **com schema
JSON-LD FAQPage** e boxes visuais destacados. Então **não repita** esses
blocos dentro de `content` — o blog cuida do rendering.

O que vai dentro do `content` (HTML) é só o corpo intelectual do artigo:
introdução + seções numeradas + tabela comparativa (quando faz sentido)
+ conclusão. **Sem** repetir Key Takeaways ou FAQ dentro do HTML.

**Estrutura do `content`:**

1. **Parágrafo de abertura (hook)** — 2 frases:
   - Frase 1: uma estatística ou fato-ameaça do tema (ex.: "Mais de 60%
     das APIs em produção rodam sem cache em camada, gerando latência
     evitável e custo de banco de dados duplicado.")
   - Frase 2: a promessa/o que o artigo entrega
   - Opcional: uma frase contextualizando que o texto foi elaborado a partir de apuração técnica interna (sem citar YouTube e sem links externos)

2. **H2 introdutório** (contextualiza o porquê), 2–3 parágrafos.

3. **7 a 10 seções numeradas em H2** — "Passo 1: ...", "Passo 2: ..." ou
   "1. Título", "2. Título". Cada seção tem **3 a 4 parágrafos** nesta
   microestrutura:
   - **Parágrafo-definição:** afirma o quê + uma estatística/dado
     concreto (quando existir)
   - **Parágrafo-ângulo próprio:** análise, recorte, contraponto ou
     dado proprietário que a fonte original não tem. Aqui é onde a
     tese aparece — sem este parágrafo, a seção é derivativa.
     Padrões válidos: "Na Techify, observamos que…", "O que a maioria
     dos posts não menciona é…", "O recorte que muda na prática é…",
     "Diferente do que a comunicação oficial sugere, …".
   - **Parágrafo-aplicação:** como fazer certo / como aplicar /
     armadilhas reais, sempre com ação específica e contexto
     (público, escala, stack).
   - **Parágrafo-transição:** liga para a próxima seção (opcional —
     pode mesclar na aplicação).

   **Pelo menos 2 das 7-10 seções devem carregar tese forte** — não
   só descrever o que o produto/conceito é, mas defender uma posição
   ("não use X em cenário Y", "X só ganha de W quando Z", "o ROI real
   só aparece a partir de N usuários").

   Subseções opcionais em H3 dentro de cada H2 quando o tema pedir. Usar
   `<ul>`/`<ol>`/`<code>` sempre que ajudar escannabilidade.

4. **H2 "Comparação" ou tabela** — use `<table class="comparison">`
   sempre que o tema permitir (ex.: antes vs depois, ferramenta A vs B,
   abordagem X vs Y). A classe `comparison` aplica header azul e
   zebra-striping. Não forçar quando não faz sentido.

5. **H2 Conclusão** — 2 parágrafos:
   - Recapitula o principal em 1 frase
   - CTA: leva para a home da marca ou para uma ação clara (ex.:
     "Se precisa implementar isso na sua operação, a nossa equipe
     presta consultoria. Fale com a gente em [$SITE_NAME]($ORG_URL).")

---

#### 5.1. Elementos inline GEO/AEO (obrigatórios)

O template do artigo já renderiza KeyTakeaways, TOC, FAQ e AuthorBio
como blocos separados. O que vai **dentro** do `content` precisa carregar
sinais de citabilidade e conversão. Use as classes CSS já estilizadas
no blog (`global.css`):

**0) Outbound internal links (obrigatório, antes de qualquer outra coisa):**

Aplique aqui a política definida em 2.3 + os pares escolhidos no passo 3.1.

Mecânica:
- Pegue 3–5 trechos do `content` em que conceitos/produtos do alvo
  aparecem naturalmente. Embrulhe o trecho em
  `<a href="/blog/{slug-alvo}">trecho</a>`.
- Distribua os links pelo corpo (não concentre todos na mesma seção).
- Anchor text é o conceito real, não "saiba mais", "veja", "neste artigo".
- Não embrulhe headings (`<h2>`, `<h3>`), nem itens de lista de FAQ /
  Key Takeaways (esses ficam em campos separados, não no `content`).
- Não coloque internal link dentro de um `<aside class="cta-inline">`
  (CTAs apontam pra marca, não para outros artigos).
- O mesmo slug-alvo aparece no máximo 1× em todo o `content`.

Exemplo:

```html
<!-- Antes -->
<p>Os agentes de IA precisam de governança auditável...</p>

<!-- Depois -->
<p>Os <a href="/blog/claude-managed-agents-o-que-muda-para-empresas-em-2026">agentes de IA</a> precisam de governança auditável...</p>
```

Se você não conseguir 3 alvos topicamente válidos no inventário, **não
force**: prefira 3 links bons a 5 links forçados. Mas registre isso como
sinal de que o blog ainda não tem cobertura adjacente — e considere se
o tema do novo artigo deveria virar uma série.

**a) CTAs inline distribuídos (2 no corpo):**

Insira 2 blocos `<aside class="cta-inline">` espalhados pelo corpo (não
no início nem no fim, que já têm CTA). Sugestão:
- 1 após a **3ª** seção H2
- 1 após a **6ª** seção H2 (ou penúltima, se houver < 7)

Estrutura:

```html
<aside class="cta-inline">
  <h3>Headline curto (benefício ou urgência)</h3>
  <p>1 frase de body explicando a oferta.</p>
  <p><a href="$ORG_URL">Texto do botão</a></p>
</aside>
```

**Não repita o mesmo headline.** Varie: "Avalie sua situação",
"Agende um diagnóstico", "Solicite um escopo", "Converse com um
especialista".

**b) Stat callouts (≥ 2 por artigo):**

Destaque números quantificados em pelo menos 2 lugares do corpo. O
callout é **sempre inline dentro de um parágrafo** — flui com o texto
como um highlighter. Nunca use como bloco isolado com quebras de linha
internas (o CSS clona o background inline e quebrar o conteúdo deixa o
visual feio, parecendo uma caixa flutuante no meio do texto).

Padrão correto (um número + contexto, tudo em uma linha conceitual):

```html
<p>
  A adoção de AI Overviews acelerou em 2026:
  <span class="stat-callout"><strong>47%</strong> das buscas online já
  ativam o resumo gerado por IA</span>, segundo a Similarweb.
</p>
```

Padrão correto (múltiplos números numa mesma frase — aceitável):

```html
<p>
  O modelo entrega <span class="stat-callout"><strong>81%</strong> no
  SWE-bench, <strong>1M</strong> de contexto e <strong>$0.50</strong>
  por milhão de output</span> — com pesos abertos.
</p>
```

Quando o destaque precisa ser um card grande fora de parágrafo, use a
variante `stat-callout-block` como elemento separado:

```html
<aside class="stat-callout-block">
  <strong>97%</strong>
  de recall em Needle-in-a-Haystack com contexto de 1M tokens.
</aside>
```

O retriever premia parágrafos com dado numérico + contexto — é o
padrão de citação preferido pelo Google AI.

**c) Case study (quando a fonte trouxer):**

Quando o vídeo-fonte citar exemplo real ou métrica de cliente, blocar
em `<div class="case-study">`. Só use se o dado for real — não invente.

```html
<div class="case-study">
  <span class="label">Case</span>
  <p class="metric">400% de aumento em 6 semanas</p>
  <p>Descrição breve: como a empresa X conseguiu Y usando Z.</p>
</div>
```

**d) Urgency note (1×):**

1 parágrafo de urgência suave, baseado em fato (não fear-mongering):

```html
<p class="urgency-note">
  Cada semana sem [X] significa [perda específica], enquanto
  concorrentes consolidam presença em [domínio relevante].
</p>
```

#### 5.2. Regras de copy citability-first (GEO/AEO)

Estas regras existem porque o blog é canal comercial: **ser citado
pelo retriever E, ao ser citado, carregar a marca**. Copy genérico é
filtrado; copy específico + branded é preferido.

1. **Primeira frase de cada H2 = resposta direta, auto-contida.** Não
   abra com "Vamos falar sobre…" ou "Agora que você entendeu…". Abra
   com a afirmação que responderia a pergunta implícita do H2. Exemplo:

   H2 "Como escolher um modelo de IA para produção" →
   1ª frase: "A escolha do modelo em produção se resolve por três
   critérios: latência exigida, custo por token no volume esperado e
   janela de contexto mínima para o caso de uso."

   Frase lift-ready — o retriever pode citar verbatim sem precisar de
   mais contexto.

2. **Brand-adjacency natural (≥ 3 menções citáveis da marca no corpo,
   fora de CTAs).** Em pelo menos 3 parágrafos, mencione a marca em
   **contexto técnico/experiencial**, não em contexto de venda:

   - "Na [marca], observamos que…" (experiência coletiva)
   - "A [marca] recomenda…" (posicionamento)
   - "Em auditorias da [marca], 8 em cada 10…" (dado interno)
   - "Projetos que implementamos na [marca] mostram…"

   **Não conta:** menção dentro de `<aside class="cta-inline">` (já
   tem sua função). O retriever cita o parágrafo inteiro — se a marca
   está no parágrafo, vai junto na citação.

3. **Densidade de especificidade.** Troque genéricos por específicos
   sempre que possível:

   | Genérico | Específico |
   |---|---|
   | uma empresa | uma PME de 50 funcionários |
   | muitos | 65% |
   | rápido | em 90 segundos |
   | recentemente | em março de 2026 |
   | ferramenta | OpenAI GPT-4 Turbo |

   Specificity = citability. Retriever nunca cita "muitos" — cita "65%".

4. **Proibido abertura conversacional de parágrafo.** Retriever corta
   frases como "Bom, vamos entender…", "Agora que…", "Primeiro, note
   que…". Comece com o fato. A construção "Na [marca], …" é permitida
   porque ancora a marca.

**HTML válido permitido:** `<h2>`, `<h3>`, `<p>`, `<pre><code>`,
`<code>`, `<ul>`, `<ol>`, `<li>`, `<strong>`, `<em>`, `<a>`, `<table>`,
`<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>`, `<blockquote>`, `<figure>`,
`<img>`. Escape entidades HTML em código inline (`&lt;`, `&amp;`).

**Tamanho alvo do `content`:** 6 a 12 KB de HTML (artigos longos de
guia), ~1500 a 2500 palavras dentro do corpo.

### 6. Preencher os campos separados

- **`key_takeaways`** (array de 5 strings, cada uma 20–35 palavras):
  - Comece cada bullet com um verbo imperativo (Configure, Monitore,
    Valide, Automatize, Implante…)
  - Cada bullet deve ser auto-contido e citável
  - Inclua número/% quando fizer sentido
  - O 5º bullet **vira CTA suave** mencionando a marca (ex.:
    "Contrate consultoria especializada quando a rede tem mais de 20
    endpoints e alta rotatividade de regras.")

- **`faq`** (array de 5 objetos `{q, a}`):
  - Cada `q` deve soar como uma query literal que alguém digitaria no
    Google ("Como configurar X?", "Qual a diferença entre X e Y?",
    "Quanto custa X?")
  - `a` com 60–120 palavras, resposta direta, auto-contida, pode conter
    HTML simples (`<strong>`, `<code>`)
  - Não cumprimente ("Ótima pergunta!") — responda direto
  - Pelo menos 1 das 5 respostas menciona a marca naturalmente

- **`hero_image_url`** (opcional): se o usuário não mandou imagem,
  **omita o campo** — o template usa fallback automático para a logo.
  Não tente baixar screenshot do YouTube sem autorização.

- **`aggregate_rating`** (opcional, **APENAS** em artigos de review ou
  comparação de ferramentas/produtos com metodologia explícita):

  ```json
  "aggregate_rating": {
    "value": 4.6,
    "count": 8,
    "best": 5,
    "worst": 1
  }
  ```

  - `value`: média da avaliação (não inventada — precisa ser derivada de
    algo concreto, ex.: média das notas que o artigo atribuiu a cada
    ferramenta; ou média ponderada por dimensão avaliada).
  - `count`: número total de itens avaliados (nº de ferramentas
    comparadas, nº de dimensões, nº de usuários entrevistados).
  - `best` / `worst`: escala (default 5/1 se omitidos).

  **Quando usar:** artigos do tipo "Top 5 ferramentas X", "Comparativo:
  ferramenta A vs B vs C", "Melhores opções de Y em 2026" — onde o
  próprio artigo documenta critérios de avaliação e aplica notas.

  **Quando NÃO usar:** tutoriais, guias "como fazer X", artigos
  conceituais. Emitir rating sem review genuíno viola as Google Search
  Essentials e pode acionar manual action (penalidade manual que tira
  o site do índice de rich results).

  **Regra de ouro:** só preencha se o leitor conseguir apontar no
  artigo a metodologia que fundamenta a nota. Em dúvida, omita.

### 7. Metadados obrigatórios

- `title`: ≤ 60 caracteres, inclua número ou ano quando natural ("7
  passos", "Guia 2026"). Coloque a palavra-chave principal no início.
- `summary`: 1 frase, 140–180 caracteres, sem aspas internas, termina
  sem ponto final opcional.
- `meta_title`: ≤ 60 chars. Pode ser igual ao `title` ou uma variação
  com sufixo tipo "| $SITE_NAME".
- `meta_description`: 140–160 chars, termina com CTA verbo-imperativo
  ("Veja o guia completo.", "Aprenda agora.", "Fale com nossa equipe.").
- `slug`: **omita** — a API gera do title.
- `author_name`: use o valor de `DEFAULT_AUTHOR_NAME` configurado no
  `wrangler.toml` (persona editorial padrão). Só mude se o usuário pedir
  outro nome.
- `category`: um dos 4 slugs canônicos.
- `tags`: 3 a 6 tags em minúsculas, separadas por hífen quando
  multi-palavra (`"ia-generativa"`, `"sql"`). Reuse o que existe.

### 8. Criar o draft

Monte o JSON e salve em `/tmp/article-VIDEO_ID.json` (sempre com o
`VIDEO_ID` no nome para não colidir com artigos gerados em execuções
anteriores):

```json
{
  "title": "...",
  "summary": "...",
  "meta_title": "...",
  "meta_description": "...",
  "category": "tutoriais",
  "tags": ["tag1", "tag2", "tag3"],
  "author_name": "$DEFAULT_AUTHOR_NAME",
  "content": "<p>...</p>",
  "key_takeaways": [
    "Bullet 1 começando com verbo...",
    "Bullet 2 ...",
    "Bullet 3 ...",
    "Bullet 4 ...",
    "Bullet 5 com CTA suave pra marca..."
  ],
  "faq": [
    {"q": "Como fazer X?", "a": "..."},
    {"q": "Qual a diferença entre X e Y?", "a": "..."},
    {"q": "Quanto custa X?", "a": "..."},
    {"q": "X funciona em Y?", "a": "..."},
    {"q": "Por onde começar com X?", "a": "..."}
  ]
}
```

Submeta:

> Se usar `claude -p` para gerar o JSON a partir de arquivos em `/tmp`, use
> `--dangerously-skip-permissions` (ou injete o conteúdo no prompt). Sem isso,
> o Claude pode retornar apenas pedido de autorização para ler arquivos.

```bash
RESP=$(curl -s -X POST "$BLOG_URL/api/articles" \
  -H "Authorization: Bearer $BLOG_KEY" \
  -H "Content-Type: application/json" \
  --data @/tmp/article-VIDEO_ID.json)

SLUG=$(echo "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['article']['slug'])")
```

O POST retorna `{"article": {...}}` com envelope. Pegue o slug em
`article.slug`, não na raiz.

### 9. Publicar

```bash
curl -s -X POST "$BLOG_URL/api/publish/$SLUG" -H "Authorization: Bearer $BLOG_KEY"
```

Isso flipa o status `draft → published`, dispara IndexNow e Google ping
em background.

### 9.5. Backlink pass (inbound) — obrigatório

Agora o artigo novo está publicado e tem URL `/blog/$SLUG`. Falta a outra
metade do internal linking: adicionar links de **outros artigos** apontando
pra este. Isso é o que tira o artigo da condição de "órfão" e ajuda no
indexamento.

Reabra `/tmp/articles_index.txt` (passo 3.1) e selecione **3 a 5 artigos
publicados** que vão receber backlink. Critérios:

- Mesmo subtema/produto (peso máximo).
- Mesma categoria do novo artigo.
- Tags em comum.
- Artigo que cita um conceito que o novo artigo agora explica em
  profundidade (oportunidade clara de aprofundar).
- **Evite linkar de fontes que já têm 5 links inline** — para preservar a
  política de 3–5 links por artigo da rede. Cheque rapidamente:

  ```bash
  curl -s "$BLOG_URL/api/articles/SLUG_CANDIDATO" \
    -H "Authorization: Bearer $BLOG_KEY" \
    | python3 -c "import sys,json,re; c=json.load(sys.stdin)['article']['content']; print(len(re.findall(r'href=\"(/blog/[^\"]+)\"', c)))"
  ```

  Se já estiver em 5, descarte e escolha outro.

Para cada artigo escolhido:

1. **Fetch do `content` atual:**

   ```bash
   curl -s "$BLOG_URL/api/articles/SLUG_FONTE" \
     -H "Authorization: Bearer $BLOG_KEY" \
     | python3 -c "import sys,json; print(json.load(sys.stdin)['article']['content'])" \
     > /tmp/source-SLUG_FONTE.html
   ```

2. **Identificar 1 trecho contextual** dentro do HTML onde o anchor faz
   sentido natural pro tema do artigo novo. Não invente frase nova; ache
   um trecho já escrito que mencione o conceito.

3. **Inserir o link inline** preservando todo o HTML existente — só
   embrulhe o trecho identificado:

   ```html
   <!-- Antes -->
   <p>...e usar o agente para automatizar fluxos do dia a dia...</p>

   <!-- Depois -->
   <p>...e usar o agente para <a href="/blog/$SLUG">automatizar fluxos do dia a dia</a>...</p>
   ```

   Regras (mesmas de 5.1):
   - Anchor text descritivo, nunca "clique aqui" / "leia mais".
   - Path relativo `/blog/$SLUG`.
   - Não modificar `key_takeaways` nem `faq` (eles vêm de campos
     separados, não do `content`).
   - Não tocar em outros links já existentes no artigo fonte.
   - Apenas 1 backlink por artigo fonte apontando pro novo URL.

4. **Validar HTML** antes do PUT (não estourar o markup):

   ```bash
   python3 -c "from html.parser import HTMLParser; p=HTMLParser(); p.feed(open('/tmp/source-SLUG_FONTE-edited.html').read()); print('OK')"
   ```

5. **PUT só o campo `content`** (PUT é parcial — não envie outros campos):

   ```bash
   python3 -c "
   import json
   c = open('/tmp/source-SLUG_FONTE-edited.html').read().rstrip('\n')
   print(json.dumps({'content': c}))
   " > /tmp/payload-SLUG_FONTE.json

   curl -s -X PUT "$BLOG_URL/api/articles/SLUG_FONTE" \
     -H "Authorization: Bearer $BLOG_KEY" \
     -H "Content-Type: application/json" \
     --data-binary @/tmp/payload-SLUG_FONTE.json
   ```

   > Use `curl --data-binary @file.json` em vez de `urllib.request` em
   > Python: o User-Agent default do urllib é frequentemente bloqueado
   > pelo Cloudflare na frente do worker (HTTP 403). Curl passa.

6. **Verificar** que o PUT entrou e o número total de links inline está
   no intervalo 3–5:

   ```bash
   curl -s "$BLOG_URL/api/articles/SLUG_FONTE" \
     -H "Authorization: Bearer $BLOG_KEY" \
     | python3 -c "import sys,json,re; c=json.load(sys.stdin)['article']['content']; links=re.findall(r'href=\"(/blog/[^\"]+)\"', c); print(f'links: {len(links)}'); [print(' -', l) for l in links]"
   ```

Repita para cada um dos 3–5 artigos escolhidos. **Não republique** os
artigos fonte: o PUT já atualiza `updated_at` e o IndexNow é re-disparado
no próximo `publish` natural; se quiser disparar agora, use
`POST /api/publish/SLUG_FONTE` (idempotente).

### 10. Reportar ao usuário

Devolva apenas:

- URL final (`$BLOG_URL/$SLUG`)
- Título
- Categoria
- Tags
- Quantidade de palavras do `content` (opcional)
- Internal linking: N outbound + N inbound (lista os slugs que
  receberam backlink)

**Sem narrar curl por curl.** Sem mostrar JSON do payload. Mensagem
curta, 3-5 linhas.

---

## Checklist de qualidade (antes do POST)

**Originalidade (gating — se falhar, NÃO publique):**
- [ ] Pré-rascunho do passo 4.1 preenchido com TESE, ÂNGULOS, DADO NOVO
      e DECISÃO acionável — sem itens vagos
- [ ] ≥ 3 dos 5 ângulos proprietários presentes no corpo (tese contrária,
      experiência Techify, dado/comparação novo, aplicação prática para o
      público, risco minimizado pela fonte)
- [ ] ≥ 2 das seções H2 carregam tese forte (defendem posição, não só
      descrevem). Não pode ser sequência de "X é Y, X faz Z".
- [ ] **Teste de derivatividade:** removendo o nome do produto/projeto
      do artigo, ainda sobra análise útil. Se vira só descrição
      genérica, refaça.
- [ ] Nenhuma seção é parafraseio direto de bloco contínuo da
      transcrição (transcrição é insumo, não rascunho)
- [ ] Resposta clara para "o que o leitor vai fazer diferente depois de
      ler" — adotar, não adotar, esperar, migrar, comparar com Y.

**Metadados do YouTube (antes de escrever):**
- [ ] Rodou `curl` na URL do vídeo com User-Agent de navegador e
      extraiu `title`, `author` e `shortDescription` da página
- [ ] Nome do projeto/produto no artigo confere com o título do vídeo
      ou com a descrição (não com a transcrição, que tem erros de ASR)
- [ ] Não incluiu links externos de terceiros no `content` (somente links
      da marca/domínio próprio e links internos do blog)
- [ ] Se houver link de vídeo YouTube no artigo, validou que é do canal
      oficial Techify (`@techifyone` / `UCtVIxwOvpe-OlgMqGBtj5Kg`); caso
      contrário, removeu o link e a citação do vídeo

**Estrutura:**
- [ ] `content` tem 7 a 10 seções numeradas em H2
- [ ] Primeiras 2 frases do `content` têm uma estatística + uma promessa
- [ ] Introdução só cita vídeo quando ele for do canal oficial Techify;
      para canais terceiros, sem citação de vídeo nem link externo
- [ ] Pelo menos 1 `<table class="comparison">` quando o tema permite
- [ ] Conclusão termina com CTA para a marca

**Blocos GEO/AEO inline (dentro do `content`):**
- [ ] 2 `<aside class="cta-inline">` distribuídos no corpo (após 3ª e 6ª
      seção), headlines variados
- [ ] ≥ 2 `<span class="stat-callout">` com números quantificados
- [ ] 1 `<div class="case-study">` quando o vídeo-fonte citar caso real
- [ ] 1 `<p class="urgency-note">` discreto, baseado em fato

**Copy citability-first:**
- [ ] Primeira frase de cada H2 é resposta direta, auto-contida (não
      transição)
- [ ] ≥ 3 menções da marca em contexto técnico/experiencial no corpo
      (fora dos CTAs)
- [ ] ≥ 5 dados específicos (números, datas, nomes próprios) no `content`
- [ ] Nenhum parágrafo abre com "Bom,", "Vamos falar", "Agora que…",
      "Primeiro, note que…"

**Campos separados:**
- [ ] `key_takeaways` tem exatamente 5 itens, verbos imperativos,
      último é CTA suave
- [ ] `faq` tem 5 perguntas tipo-query, respostas de 60–120 palavras

**Metadados:**
- [ ] `meta_title` ≤ 60 chars, `meta_description` ≤ 160 chars
- [ ] `category` ∈ {ia-fundamentos, tutoriais, arquitetura, novidades}
- [ ] `tags` reusadas da taxonomia existente quando possível
- [ ] `content` **não** repete Key Takeaways nem FAQ (template cuida
      disso)
- [ ] `author_name` = `DEFAULT_AUTHOR_NAME` do wrangler (ou o que o
      usuário pediu explicitamente)

**Internal linking (gating — 2 frentes obrigatórias):**

*Outbound (dentro do `content` deste artigo):*
- [ ] Inventário do passo 3.1 baixado e relido antes da redação
- [ ] 3 a 5 links inline `<a href="/blog/{slug-alvo}">…</a>` no `content`
- [ ] Anchor text descritivo (conceito real, nunca "clique aqui",
      "leia mais", "saiba mais")
- [ ] Path relativo `/blog/{slug}` (não URL absoluta) e cada slug-alvo
      aparece no máximo 1×
- [ ] Nenhum link em `key_takeaways`, `faq`, headings ou
      `<aside class="cta-inline">`
- [ ] HTML do `content` validado com `HTMLParser` antes do POST

*Inbound (passo 9.5, depois do publish):*
- [ ] 3 a 5 artigos publicados receberam 1 backlink contextual cada
      apontando pra `/blog/$SLUG`
- [ ] Para cada um, anchor descritivo + HTML validado + PUT só do
      campo `content`
- [ ] Nenhum artigo fonte ficou com mais de 5 links inline totais
- [ ] Verificação `curl GET` confirma o backlink em cada um

---

## Anti-padrões (não faça)

- ❌ **Reembalar o vídeo/release oficial sem tese própria** — se o
     artigo só "conta o que aconteceu" ou "explica o que o produto
     faz", é derivativo. Google e retrievers já têm 50 fontes melhores
     pra isso. Resultado: "Rastreada, mas não indexada".
- ❌ Sequência de seções que apenas descrevem features ("o que é
     X", "como X funciona", "principais capacidades de X"). Cada
     descrição precisa vir com recorte/tese/aplicação.
- ❌ Tese genérica de hype: "X é revolucionário", "vai mudar tudo",
     "o futuro chegou". Substitua por afirmação específica e
     defensável: "X só ganha de Y em cenário Z porque W".
- ❌ Aceitar a fonte como neutra. Vídeos de creators/produtos têm
     viés de hype; release oficial omite trade-offs. Sempre adicione
     o contraponto/recorte que está faltando.
- ❌ Inventar "experiência da Techify" quando ela não existe.
     Honestidade > brand-adjacency falsa. Se não tem dado interno
     sobre o tema, compense com análise/comparação proprietária.
- ❌ Copiar trechos literais da transcrição (ASR errado + baixa
     legibilidade)
- ❌ Usar o nome do projeto/produto **da transcrição** sem conferir
     com o título e a descrição do vídeo — a transcrição erra nomes
     próprios com frequência ("WatsBot" vs "WhatsBot")
- ❌ Incluir link externo de terceiro (GitHub, docs de fornecedor,
     redes sociais, afiliados, patrocinadores etc.) no corpo do artigo
- ❌ Incluir link de YouTube de canal terceiro (só pode YouTube do canal
     oficial Techify, após validação de `canonical`/`channelId`)
- ❌ Criar seção "Links úteis" no final do artigo — cada link entra
     em contexto natural dentro do corpo
- ❌ Publicar o artigo sem rodar o passo 9.5 (backlink pass). Artigo
     sem inbound vira órfão na rede e o GSC reporta como "Rastreada,
     mas não indexada" — é a falha mais comum em conteúdo novo
- ❌ Anchor text genérico ("clique aqui", "saiba mais", "veja também",
     "neste artigo") em link interno. Use sempre o conceito real
- ❌ Linkar internal apontando para o próprio artigo recém-criado
     (loop) ou usar o mesmo slug-alvo 2× no mesmo `content`
- ❌ Fazer backlink pass forçando link em artigo sem afinidade
     topical real — qualidade do anchor importa mais que volume
- ❌ Inventar estatísticas ou citar "pesquisa da Gartner" sem ter
     fonte real (risco reputacional)
- ❌ Repetir Key Takeaways ou FAQ dentro do HTML do `content` (o
     template renderiza isso em blocos próprios, vai aparecer duplicado)
- ❌ Criar categoria nova (só existem 4 canônicas)
- ❌ `meta_description` em 2 frases — é 1 frase que termina em CTA
- ❌ CTA genérico tipo "entre em contato para saber mais" — seja
     específico ao que a marca entrega
- ❌ Resumo/summary com aspas duplas internas (quebra JSON)
- ❌ Tag "blog" ou "artigo" (meta-tags inúteis)

---

## Exemplo condensado (referência)

```json
{
  "title": "Cache Redis em APIs: guia completo para 2026",
  "summary": "Como usar Redis como cache de leitura em APIs de alta demanda: estratégias de invalidação, TTL e padrões de consistência para evitar dados stale.",
  "meta_title": "Cache Redis em APIs: guia 2026",
  "meta_description": "Implemente cache Redis em APIs sem quebrar consistência. Estratégias de TTL, invalidação e padrões de produção. Veja o guia completo.",
  "category": "tutoriais",
  "tags": ["redis", "cache", "api", "performance"],
  "content": "<p>Mais de 60% das APIs em produção rodam sem cache em camada, gerando latência evitável e custo de banco dobrado, segundo survey da StackOverflow 2025. Este guia mostra como implementar cache Redis em APIs sem introduzir bugs de consistência, passo a passo.</p><p>Este guia foi estruturado a partir de apuração técnica e experiência prática em implementação.</p><h2>Por que APIs sem cache são caras</h2><p>APIs sem cache pagam a mesma query no banco em cada request, mesmo quando o resultado não muda em minutos. <span class=\"stat-callout\"><strong>80%</strong> das queries em uma API típica read-heavy podem sair do banco e ir para um cache em memória.</span> Na Techify, observamos que times subestimam esse custo até a conta do banco explodir em produção.</p><h2>Passo 1: Identificar queries cacheáveis</h2><p>Queries cacheáveis são aquelas cujo resultado muda raramente e é consultado com frequência — leitura de perfil, configurações, catálogos. Projetos que implementamos na Techify mostram que essas três categorias respondem por 60% a 80% do tráfego de leitura de uma API típica.</p><h2>Passo 2: Definir TTL e política de invalidação</h2><p>TTL sozinho não basta para dados que mudam com eventos de escrita. A regra é: TTL curto (30–300s) como safety net + invalidação ativa no caminho de escrita.</p><h2>Passo 3: Implementar cache aside</h2><p>O padrão cache aside funciona em três passos: tenta ler do cache, se miss consulta o banco, popula o cache com TTL. É o mais simples e cobre 90% dos casos em produção.</p><aside class=\"cta-inline\"><h3>Sua API está cara sem cache?</h3><p>A Techify audita padrões de acesso, propõe estratégia por domínio e implementa observabilidade de cache em produção.</p><p><a href=\"https://techify.one\">Agende um diagnóstico</a></p></aside><h2>Passo 4: Invalidação ativa no caminho de escrita</h2><p>...</p><h2>Passo 5: Observabilidade de hit rate</h2><p>...</p><h2>Passo 6: Comparação de estratégias</h2><table class=\"comparison\"><thead><tr><th>Estratégia</th><th>Latência</th><th>Consistência</th><th>Complexidade</th></tr></thead><tbody><tr><td>Cache aside</td><td>Baixa</td><td>Eventual</td><td>Baixa</td></tr><tr><td>Write-through</td><td>Média</td><td>Forte</td><td>Média</td></tr><tr><td>Write-behind</td><td>Muito baixa</td><td>Fraca</td><td>Alta</td></tr></tbody></table><p class=\"urgency-note\">Cada semana sem uma política de cache formalizada significa custo de banco subindo e p95 instável, enquanto concorrentes consolidam latência sub-100ms em AI Overviews.</p><h2>Passo 7: Validação com canary</h2><p>...</p><aside class=\"cta-inline\"><h3>Cache em produção sem risco</h3><p>Revisamos sua política de invalidação antes do rollout completo.</p><p><a href=\"https://techify.one\">Fale com um especialista</a></p></aside><h2>Conclusão</h2><p>Um cache bem projetado reduz latência p95 em até 10x e corta 80% das queries no banco. Se sua aplicação tem mais de alguns milhares de requests por minuto, fale com a Techify sobre arquitetura de cache em produção.</p>",
  "key_takeaways": [
    "Identifique queries read-heavy cujo resultado muda raramente — são as melhores candidatas a cache, cortando até 80% da carga no banco.",
    "Defina <strong>TTL curto + invalidação ativa</strong> para dados que mudam: TTL sozinho gera dados stale em picos de escrita.",
    "Monitore hit rate via métricas do Redis (INFO stats) — abaixo de 70% indica que a política está errada, não que precisa de mais memória.",
    "Valide em produção com canary: ative o cache para 5% do tráfego e compare latência p95 antes de fazer rollout completo.",
    "Contrate consultoria especializada quando a aplicação cresce e mudanças de cache começam a introduzir bugs difíceis de reproduzir."
  ],
  "faq": [
    {"q": "Como invalidar cache no Redis?", "a": "Use <code>DEL chave</code> para invalidação pontual ou <code>UNLINK</code> para chaves grandes (é async). Para invalidar por padrão, mantenha um set auxiliar com as chaves relacionadas e delete em batch — evite <code>KEYS</code> em produção, que varre todo o keyspace."},
    {"q": "Qual a diferença entre cache aside e write-through?", "a": "<strong>Cache aside</strong> é a aplicação que lê primeiro do cache e, em miss, consulta o banco e popula. <strong>Write-through</strong> grava no cache junto com o banco. Aside é mais simples; write-through elimina janelas de staleness mas dobra a escrita."},
    {"q": "Que TTL usar no Redis?", "a": "Depende da tolerância a staleness. Para dados editados raramente, 5–15 minutos. Para dados em tempo real, 30 segundos ou invalidação ativa sem TTL. Evite TTL de horas em dados que mudam — geram inconsistência difícil de debugar."},
    {"q": "Redis aguenta quantas requests por segundo?", "a": "Um node em hardware modesto aguenta 50–100k ops/s em comandos simples. Cluster horizontaliza — cada shard adiciona capacidade. Se chegou no limite do CPU, use pipeline ou Lua script para agrupar comandos."},
    {"q": "Como contratar consultoria de cache?", "a": "Audite padrões de acesso, meça hit rate atual, proponha estratégia de invalidação por domínio e implemente observabilidade de cache (hit/miss, p95, evictions). Indicado para times com aplicações de alto throughput e múltiplos consumidores."}
  ]
}
```

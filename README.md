# RaveX 🎬

Uma plataforma de watch party em tempo real inspirada no aplicativo Rave, construída com uma arquitetura moderna preparada para escalar milhares de usuários simultâneos.

![RaveX Concept](https://images.unsplash.com/photo-1542204165-65bf26472b9b?auto=format&fit=crop&q=80&w=1200)

## 🏗 Arquitetura do Sistema

O sistema separa completamente o **Frontend** do **Backend**. Isso garante velocidade no carregamento de tela (Edge Network) e um banco de dados robusto focando unicamente em dados e sincronia.

**Frontend:**
- **React + Vite / TypeScript:** Componentização, tipagem forte, e Hot Module Reload extremamente rápido.
- **Zustand:** Gerenciamento de estado global no lado do cliente com zero boilerplate (Sessão do Usuário).
- **React-Router:** Controle de rotas (`/`, `/login`, `/room/:id`).
- **CSS Vanilla (Glassmorphism e Dark Theme):** Desempenho máximo, visual premium sem dependências pesadas extras.
- **Cloudflare Pages:** Hosting Edge do frontend para garantir o mínimo de latência no download de estáticos globalmente.

**Backend (Supabase):**
- **PostgreSQL:** Sistema relacional com UUIDs mantendo usuários, salas, mensagens de chat.
- **Supabase Auth:** Gerencia Login Email/Senha e Google OAuth de maneira nativa com segurança JWT no RLS.
- **Supabase Realtime:** 
  - Comunica por WebSockets o Chat (`postgres_changes`) usando triggers do DB.
  - Síncrona canais transitórios (Broadcast via canais) para sincronia com latência em milissegundos (`play`, `pause`, `seek`).
  - Lida com a presença online de sala (`Presence` no canal).

### Fluxo de Funcionamento (Data Flow)

1. **Entrada e Auth:** O usuário entra em `/login`, recebe um JWT do Supabase, que é populado na Store (`Zustand`) e salvo no LocalStorage.
2. **Dashboard:** A tela Home consulta a tabela de `rooms` disponíveis do banco combinando os timestamps de atividade.
3. **Sala Ativa:**
   - O `UserList` entra no canal `presence:room_id` reportando que ele está na sala e lendo quem está. 
   - O `LiveChat` escuta a tabela `messages`, qualquer "insert" no banco notifica na tela renderizando a nova bolha.
   - O player de vídeo escuta o canal de broadcraft `room:{id}`. Apenas aquele com `user_id == host_id` tem permissão (controlada por UI + Canal auth no futuro) para enviar eventos `.send({ type: 'broadcast', event: 'sync_pause' })` avisando os assinantes, que sincronizam o player.

## 🚀 Como Rodar o Projeto

1. Clone o repositório e instale as dependências:
   ```bash
   npm install
   ```
2. Defina suas variáveis:
   Crie um `.env` seguindo `.env.example`
   ```env
   VITE_SUPABASE_URL="SUA_URL"
   VITE_SUPABASE_ANON_KEY="SUA_KEY"
   ```
3. Prepare o Banco de Dados
   Copie todo o conteúdo do arquivo localizado em `supabase/migrations/0001_initial_schema.sql` e execute dentro do **SQL Editor** do Supabase para criar as tabelas e politicas.
4. Execute e visualize:
   ```bash
   npm run dev
   ```

## 🌐 Deploy no Cloudflare Pages

1. Conecte o repositório do Github no painel do **Cloudflare Pages**.
2. No Build Settings defina:
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Build output directory: `dist`
3. Adicione as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` na área "Environment variables" no próprio Cloudflare.
4. Salve e deixe rodar o Deploy. Cloudflare cria uma Edge Network automática.

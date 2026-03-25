# Plano de Implementação: Sistema de Amigos e App Social

Este plano detalha a expansão do RaveX para incluir funcionalidades completas de rede social, conforme solicitado.

## 1. Banco de Dados (Supabase/PostgreSQL)

Precisamos adicionar as seguintes tabelas ao esquema público:

- **friends**: Relacionamentos entre usuários.
- **albums**: Coleções de fotos.
- **direct_messages**: Mensagens privadas em tempo real (Texto, Imagem, Áudio).
- **notifications**: Alertas de convites e mensagens.

## 2. Componentes Novos

- **Profile**: Edição de bio e troca de avatar.
- **Gallery**: Visualização e upload de fotos.
- **Friend List**: Busca global e gerenciamento de solicitações.
- **Private Chat**: Janela de chat com suporte a mídia e áudio.

## 3. Tecnologias Adicionais

- **MediaRecorder API**: Para gravação de áudio nativa no chat.
- **Supabase Storage**: Buckets para fotos e mensagens de voz.
- **Zustand**: Sincronização de notificações globais.

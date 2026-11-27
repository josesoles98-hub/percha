-- El agente puede enviar solo los mensajes simples (bienvenida, datos de pago,
-- preguntas que el cerebro responde). Comprobantes, reservas y todo lo que
-- necesita a la dueña sigue esperando su aprobación.
alter table public.agent_settings add column if not exists auto_reply boolean not null default false;
-- Para mostrar en la bandeja qué mensajes salieron sin aprobación.
alter table public.agent_drafts add column if not exists auto_sent boolean not null default false;

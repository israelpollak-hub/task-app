# Proyecto 2: personas relacionadas con cada tarea

Plan escrito antes de tocar el código. Trabajamos directo en la rama `main`, con el mismo
Supabase y el mismo sitio de Vercel (el profesor lo confirmó).

## 1. Qué queremos lograr

Poder guardar **contactos** (personas) y **vincularlos a las tareas** con un papel
(por ejemplo, "responsable" de esa tarea). Una persona puede estar en muchas tareas, y una
tarea puede tener muchas personas. Eso se llama relación **muchos a muchos**, y se resuelve con
una tabla puente (`task_contacts`).

## 2. Cómo está la base de datos hoy (resumen)

- `profiles`: un perfil por usuario (plan, límite de tareas, cliente de Stripe).
- `tasks`: las tareas, cada una con su `user_id` (el dueño).
- `usage_tracking`: cuántas tareas creó cada usuario por mes.
- La seguridad (RLS) ya está activada en las tres tablas.
- Migraciones actuales: de `0_...` a `8_...`. La nueva será `9_contacts.sql`.

## 3. Tablas nuevas

### `contacts` (las personas)

| Columna | Tipo | Reglas |
|---|---|---|
| `contact_id` | uuid | Clave principal, se genera sola |
| `user_id` | uuid | Dueño del contacto. Obligatorio. Se llena solo con el usuario que inició sesión. Apunta a `profiles`; si se borra el usuario, se borran sus contactos |
| `name` | texto | Obligatorio |
| `relationship` | texto | Opcional (ej. "jefe", "cliente", "amigo") |
| `email` | texto | Opcional |
| `created_at` | fecha y hora | Se llena sola |

### `task_contacts` (la tabla puente)

| Columna | Tipo | Reglas |
|---|---|---|
| `task_id` | uuid | Apunta a `tasks`. Si se borra la tarea, se borran sus vínculos |
| `contact_id` | uuid | Apunta a `contacts`. **Sin borrado automático**: no deja borrar un contacto que aún está en alguna tarea |
| `role` | texto | Obligatorio. Solo estos valores: `responsible`, `collaborator`, `stakeholder` |

- La clave principal es (`task_id`, `contact_id`): **una persona aparece una sola vez por
  tarea**, con un solo rol.
- Los valores de `role` van en inglés, igual que el resto de la app (los botones y textos
  están en inglés). En pantalla se mostrarán como "Responsible", "Collaborator" y "Stakeholder".

## 4. Qué pasa al borrar cosas

| Si se borra... | Resultado |
|---|---|
| Una tarea | Sus vínculos en `task_contacts` se borran solos. Los contactos quedan intactos |
| Un contacto sin tareas | Se borra |
| Un contacto que está en alguna tarea | **Se bloquea.** La app avisa: "Este contacto está en N tareas. Quítalo de ellas primero" |
| Un usuario (cuenta completa) | Se borra todo lo suyo (tareas, contactos y vínculos) sin errores |

## 5. Reglas de seguridad (RLS) en español sencillo

RLS significa que la propia base de datos decide qué filas puede ver cada persona, aunque
alguien intente saltarse la app.

**`contacts`**
- Solo ves tus propios contactos (donde `user_id` eres tú).
- Solo puedes crear, cambiar o borrar contactos tuyos.
- No puedes crear un contacto a nombre de otro usuario.

**`task_contacts`**
- Solo ves un vínculo si **la tarea es tuya y el contacto también es tuyo**.
- Solo puedes crear, cambiar o borrar un vínculo si **ambos (la tarea y el contacto) son tuyos**.
- Esto impide vincular tu contacto a la tarea de otra persona, o la tarea tuya a un contacto de otra.
- Como la tabla puente no tiene `user_id`, la regla consulta `tasks` y `contacts` para comprobar
  quién es el dueño.

## 6. Pantallas que cambian

1. **Nueva página `/contacts`:** lista de tus contactos (nombre, relación, email), con botones
   para agregar, editar y borrar. Si intentas borrar uno que está en tareas, muestra el aviso.
2. **Pantalla de editar tarea (`/task?id=...`):** una sección nueva "People" que muestra las
   personas de la tarea con su rol, un selector para **agregar** una persona (elegir contacto y rol) y un
   botón para **quitarla**.
3. **Un botón "Contacts"** en el dashboard, junto a "Create Task", para llegar a la página
   nueva. (Se puso ahí y no en el encabezado, porque el encabezado también se ve en la pantalla
   de login, antes de iniciar sesión.)

La lista de tareas del dashboard **no cambia** por ahora.

## 7. Archivos que se tocan

- Nuevo: `supabase/migrations/9_contacts.sql` (tablas, reglas y seguridad).
- Se corrige: `lib/database.types.ts` (agregar las dos tablas nuevas y quitar la columna `rank`,
  que está en los tipos pero **no existe** en la base de datos real).
- Se agrega: `types/models.ts` (tipos `Contact` y `TaskContact`).
- Nuevo: `hooks/useContacts.ts` (leer, crear, editar y borrar contactos) y funciones para
  vincular o quitar contactos de una tarea.
- Nuevo: `app/contacts/page.tsx`.
- Cambia: `app/task/page.tsx` (la sección "People").
- No cambian: las funciones de Supabase (Edge Functions), los triggers de tareas, los pagos ni el
  límite mensual de tareas.

## 8. Orden de trabajo (y cómo no romper el sitio en vivo)

Como usamos el mismo Supabase que el sitio real, el cambio de base de datos es **solo agregar**
tablas nuevas y no toca `tasks`. Por eso el sitio actual sigue funcionando mientras trabajamos.

1. Escribir la migración `9_contacts.sql`.
2. Probar las reglas de seguridad con consultas SQL (ver sección 9) antes de aplicarla.
3. Aplicarla: `npx supabase db push`.
4. Corregir los tipos y escribir el código nuevo, probando en la computadora (`npm run dev`).
5. Cuando todo funcione y lo digas: `git push` a `main`. Vercel publica el sitio solo.
6. Probar el sitio en línea.

**Plan B (deshacer):** si algo sale mal, se borran las dos tablas nuevas
(`drop table task_contacts; drop table contacts;`). No afecta a las tareas ni a los usuarios.

## 9. Cómo comprobamos que funciona

- Con SQL (dentro de una transacción que se deshace al final, así no queda nada guardado):
  simular a **dos usuarios** y verificar que A no ve ni toca los contactos de B, y que no se puede
  vincular un contacto de B a una tarea de A (debe dar error).
- Verificar que un contacto vinculado **no se puede borrar**, y que borrar una tarea quita sus vínculos.
- En la app: crear un contacto, vincularlo a una tarea con un rol, quitarlo, intentar borrar un
  contacto vinculado (debe avisar) y confirmar que las tareas, imágenes, pagos y etiquetas con IA
  siguen igual.

## 10. Decisiones tomadas

- `role`: lista fija (`responsible`, `collaborator`, `stakeholder`).
- Una persona aparece **una sola vez por tarea**.
- Borrar un contacto vinculado: **se bloquea**.
- Pantallas: página nueva `/contacts` + selector en la pantalla de editar tarea.

## 11. Estado de la construcción

Hecho (todo probado; falta solo publicar en GitHub y Vercel):

- Migración `supabase/migrations/9_contacts.sql` aplicada en la base de datos real.
- Prueba de seguridad `docs/project2-rls-test.sql` (19 comprobaciones con dos usuarios simulados,
  dentro de una transacción que se cancela sola): 19 de 19 correctas, antes y después de aplicar
  la migración.
- Prueba completa a través de la API real, con dos usuarios temporales (ya borrados):
  23 de 23 correctas.
- Código: `lib/contacts.ts`, `hooks/useContacts.ts`, `hooks/useTaskContacts.ts`,
  `app/contacts/page.tsx`, sección "People" en `app/task/page.tsx`, botón "Contacts" en el
  dashboard, tipos nuevos en `types/models.ts` y `lib/database.types.ts` (regenerados; ya no
  aparece la columna `rank`).
- `tsc` (tipos), `lint`, pruebas unitarias y `next build` pasan sin errores.

Pendiente: publicar (`git push` a `main`) cuando lo decidas, y probar el sitio en línea.

## Apéndice: borrador de la migración (se revisa antes de aplicar)

```sql
create table public.contacts (
  contact_id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  name text not null,
  relationship text,
  email text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table public.task_contacts (
  task_id uuid not null references public.tasks on delete cascade,
  -- Sin "on delete cascade": bloquea borrar un contacto que sigue vinculado a una tarea.
  contact_id uuid not null references public.contacts,
  role text not null check (role in ('responsible', 'collaborator', 'stakeholder')),
  primary key (task_id, contact_id)
);

create index idx_contacts_user_name on public.contacts(user_id, name);
create index idx_task_contacts_contact on public.task_contacts(contact_id);

alter table public.contacts enable row level security;
alter table public.task_contacts enable row level security;

create policy "Users can CRUD own contacts"
on public.contacts for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can CRUD links between their own tasks and contacts"
on public.task_contacts for all
using (
  exists (select 1 from public.tasks t
          where t.task_id = task_contacts.task_id and t.user_id = auth.uid())
  and exists (select 1 from public.contacts c
          where c.contact_id = task_contacts.contact_id and c.user_id = auth.uid())
)
with check (
  exists (select 1 from public.tasks t
          where t.task_id = task_contacts.task_id and t.user_id = auth.uid())
  and exists (select 1 from public.contacts c
          where c.contact_id = task_contacts.contact_id and c.user_id = auth.uid())
);
```

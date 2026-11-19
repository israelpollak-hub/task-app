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

---

# Parte 2: subtareas con IA

Plan escrito antes de tocar código. Mismo Supabase, mismo repo, directo en `main`.

## P2.1 Qué queremos lograr

Que cada tarea pueda tener **subtareas** (pasos más pequeños), y que un botón pida a la IA
**sugerencias** de subtareas para esa tarea. Una tarea tiene muchas subtareas; cada subtarea
pertenece a una sola tarea (relación uno a muchos).

## P2.2 Tabla nueva: `subtasks`

| Columna | Tipo | Reglas |
|---|---|---|
| `subtask_id` | uuid | Clave principal, se genera sola |
| `task_id` | uuid | Obligatorio. Apunta a `tasks` con **borrado en cascada**: si se borra la tarea, se borran sus subtareas |
| `title` | texto | Obligatorio |
| `is_done` | booleano | Obligatorio, por defecto `false` |
| `position` | entero | Obligatorio, por defecto 0. Define el orden dentro de la tarea |
| `created_at` | fecha y hora | Se llena sola |

- Índice sobre (`task_id`, `position`) para leer rápido las subtareas de una tarea.
- No lleva `user_id`: el dueño se deduce de la tarea (igual que `task_contacts`).
- Migration nueva: `10_subtasks.sql` (no se edita ninguna de las anteriores).

## P2.3 Reglas de seguridad (RLS) en español sencillo

- Solo ves las subtareas **de tus propias tareas**.
- Solo puedes crear, cambiar o borrar subtareas de tus propias tareas.
- No puedes crear una subtarea dentro de la tarea de otra persona, ni mover una subtarea tuya
  a la tarea de otra persona (el `with check` revisa también la tarea nueva).
- Como la tabla no tiene `user_id`, la regla consulta `tasks`:
  `exists (select 1 from tasks t where t.task_id = subtasks.task_id and t.user_id = auth.uid())`.
- Una sola policy "for all" con el mismo `exists` en `using` y en `with check`.
  Nunca `using (true)`.

## P2.4 La Edge Function `suggest-subtasks`

Sigue el estilo de `create-task-with-ai`:

1. Recibe `{ task_id }` por POST, con el login del usuario (JWT) en `Authorization`.
2. Crea un cliente de Supabase con ese header, así RLS aplica como si fuera el usuario.
3. Obtiene el usuario con `auth.getUser()`; si no hay usuario, responde error.
4. Lee la tarea con `.eq("task_id", ...)`. **Si la tarea no es de ese usuario, RLS no la
   devuelve** y la función responde "tarea no encontrada" sin llamar a OpenAI (así no se gasta
   dinero por tareas ajenas).
5. Pide a OpenAI (`gpt-4o-mini`, igual que la función de etiquetas) de 3 a 8 pasos cortos, en
   formato JSON, usando el título y la descripción de la tarea y las subtareas que ya existen
   (para no repetirlas).
6. Valida la respuesta: que sea JSON, texto limpio, máximo 100 caracteres cada uno, sin
   duplicados, máximo 8. Si la respuesta no sirve, error claro; no se guarda nada raro.
7. **Devuelve las sugerencias; no escribe en la base de datos.** El usuario decide cuáles
   agregar (decisión 1 abajo).
8. La clave `OPENAI_API_KEY` ya está en los secrets de Supabase; no cambia. La función usa el
   `verify_jwt` normal (activado): solo usuarios con sesión pueden llamarla.

Costo: cada clic es una llamada pequeña a `gpt-4o-mini` (centavos o menos). El límite de
$5 en OpenAI sigue protegiendo.

## P2.5 Pantallas que cambian

Solo la pantalla de editar tarea (`/task?id=...`), con una sección nueva **"Subtasks"**, debajo
de "People":

- Lista de subtareas con casilla (hecha / no hecha), título y botón de borrar.
- Un campo para agregar una subtarea a mano.
- Un botón **"Suggest subtasks with AI"** (la IA solo se llama cuando haces clic): muestra las
  sugerencias y cada una tiene **Accept** (se guarda como subtarea) y **Reject** (se descarta,
  no se guarda nada). También hay "Dismiss all".
- Todos los botones nuevos son `type="button"` (no envían el formulario de la tarea).

El dashboard y las demás pantallas no cambian.

## P2.6 Archivos que se tocan

- Nuevo: `supabase/migrations/10_subtasks.sql`.
- Se regenera: `lib/database.types.ts` (con `npx supabase gen types typescript --linked`).
- Se agrega: tipo `Subtask` en `types/models.ts`.
- Nuevo: `hooks/useSubtasks.ts`.
- Nuevo: `supabase/functions/suggest-subtasks/index.ts` (y, si hace falta, una pieza
  compartida en `_shared/`).
- Cambia: `app/task/page.tsx` (sección "Subtasks").
- No cambian: `create-task-with-ai`, pagos, límite mensual, contactos.

## P2.7 Qué se despliega y dónde

| Cambio | Dónde | Comando | Efecto |
|---|---|---|---|
| Tabla `subtasks` | Base de datos de Supabase (**la real**) | `npx supabase db push` | Inmediato. Solo **agrega** una tabla; no toca `tasks` |
| Función `suggest-subtasks` | Supabase Edge Functions | `npx supabase functions deploy suggest-subtasks` | Inmediato. Función nueva, nadie la usa todavía |
| Pantalla "Subtasks" | Vercel (el sitio) | `git push` a `main` | Vercel publica solo en ~35 s |

Orden: primero la base de datos, luego la función, probar todo en la computadora
(`npm run dev`) y **solo después** `git push` (cuando lo digas). Así el sitio en vivo nunca
llama a algo que todavía no existe.

**Plan B (deshacer):** `drop table subtasks;` y borrar la función en Supabase. No afecta a
tareas, contactos ni usuarios.

## P2.8 Cómo comprobamos que funciona

- Prueba SQL con **dos usuarios simulados**, dentro de una transacción que se cancela sola
  (como `docs/project2-rls-test.sql`): A no ve ni toca las subtareas de B; A no puede crear
  una subtarea en la tarea de B; borrar una tarea borra sus subtareas.
- Prueba de la función: con sesión válida y tarea propia devuelve sugerencias; con tarea
  ajena o sin sesión, error y **sin llamar a OpenAI**.
- Prueba en la app: agregar a mano, marcar hecha, borrar, pedir sugerencias, agregar
  algunas; y confirmar que tareas, contactos, imágenes y pagos siguen igual.
- `tsc`, `lint`, pruebas unitarias y `next build`.

## P2.9 Decisiones que tomé yo (dime si quieres cambiar alguna)

1. La IA **solo sugiere**; el usuario acepta o rechaza cada una y se guardan solo las
   aceptadas (confirmado en tu encargo).
2. Entre 3 y **8 sugerencias** por clic (así lo pediste).
3. El orden es el de `position`; no se reordenan con arrastrar y soltar (queda fuera de esta parte).
4. No hay límite de subtareas por tarea por ahora.
5. El dashboard no muestra el avance (por ejemplo "2/5"). Se puede agregar después.

## P2.10 Estado de la construcción (Parte 2)

Hecho y probado (falta solo publicar en GitHub y Vercel, cuando lo decidas):

- Migration `supabase/migrations/10_subtasks.sql` aplicada en la base real. Nota: `db push`
  pidió `--include-all`, porque Supabase compara los números como texto ("10" va antes que "9").
  Solo aplicó la 10.
- Prueba de seguridad `docs/project2-subtasks-rls-test.sql` (dos usuarios simulados, una
  transacción que se cancela sola): 13 de 13 correctas.
- Edge Function `suggest-subtasks` desplegada (verify_jwt activado). Las reglas de validación
  están en `supabase/functions/_shared/subtaskRules.ts`, con pruebas unitarias.
- Pantalla: sección "Subtasks" en `app/task/page.tsx`, con el hook `hooks/useSubtasks.ts`.
- Test de integración `tests/integration/7_subtasks.test.ts`: 7 de 7 correctas (incluye que un
  segundo usuario no ve ni toca las subtareas, y que la función rechaza tareas ajenas).
- `tsc`, `lint` y `next build` pasan.

Hallazgo fuera de este plan (no se cambió): el trigger de la migration 3
(`delete_task_storage_object`) borra directo de `storage.objects`, y Supabase ahora lo
prohíbe. Por eso borrar una tarea **que tiene imagen** falla (y también el test
"can attach image to a task" de la suite 3). Ver el resumen final para la propuesta de arreglo.

---

# Parte 3: tercer nivel de precios (Pro) con Stripe

## P3.1 Qué es

Un tercer plan de pago, **Pro** ($25 al mes), además de Free y Premium ($10 al mes).

| | Free | Premium | Pro |
|---|---|---|---|
| Precio | $0 | $10 / mes | $25 / mes |
| Tareas por mes | 100 | 10,000 | 50,000 |
| Subtareas y contactos | sí | sí | sí |
| Etiquetas con IA al crear tareas | sí | sí | sí |
| **Sugerencias de subtareas con IA** | no | no | **sí** |

Las sugerencias de IA son la función exclusiva del plan más alto.

## P3.2 Qué se configuró en Stripe (modo test, sin dinero real)

- Producto **TaskMaster Pro** con un precio mensual de $25 (`price_...WqibN3`).
- **Portal de clientes:** se activó "cambiar de plan" entre el precio de Premium y el de Pro (con
  prorrateo), además de cancelar. Así un cliente puede subir o bajar de plan sin soporte.
- **Webhook** (`stripe-webhook`): se agregó el evento `customer.subscription.created`. Ahora
  escucha cuatro: `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated` y `customer.subscription.deleted`. La clave de firma no cambió.
- Secreto nuevo en Supabase: `STRIPE_PRO_PRICE_ID` (el precio de Pro).

## P3.3 Cambios en la base de datos y las funciones

- **Migration `11_pro_plan.sql`:** `subscription_plan` acepta `pro`; el límite de tareas sigue al
  plan en cualquier cambio (free 100, premium 10,000, pro 50,000). Los usuarios solo pueden *leer*
  su perfil (no hay policy de UPDATE), así que nadie puede darse un plan a sí mismo.
- **`stripe-webhook`:** en vez de poner siempre "premium", pide a Stripe la suscripción tal como
  está *ahora* y decide el plan por su **precio** y su **estado**. Sirve para compras nuevas,
  cambios de plan en el portal y cancelaciones.
- **`create-stripe-session`:** recibe el plan elegido. Sin plan de pago, abre Stripe Checkout con el
  precio de ese plan. Con plan de pago, abre el portal; si pide el *otro* plan, abre directo la
  pantalla que confirma el cambio.
- **`suggest-subtasks`:** comprueba el plan **en el servidor**, antes de leer la tarea y antes de
  llamar a OpenAI. Free y Premium reciben un 403 (`upgrade_required`) y no se gasta nada.

## P3.4 Pantallas

- **Perfil:** tres tarjetas de plan (precio y funciones), la actual marcada, y botones
  "Choose Premium", "Choose Pro", "Upgrade to Pro" o "Switch to Premium" según el caso;
  "Manage Subscription" para quien ya paga.
- **Tarea:** sin Pro, el botón "Suggest subtasks with AI" aparece bloqueado, con la etiqueta
  "Pro" y un enlace a la página de perfil.

## P3.5 Pruebas

- SQL (`docs/project2-pro-plan-test.sql`, transacción que se cancela sola): 11 de 11.
- Unitarias de las reglas de planes (`tests/unit/plans.test.ts`).
- Integración: Pro en los límites (suite 5), Pro y cambios Premium <-> Pro con suscripciones
  reales de Stripe en modo test, y firma incorrecta rechazada (suite 6), y rechazo a Free y
  Premium en las sugerencias de IA (suite 7).
- Prueba de punta a punta: una cuenta nueva eligió Pro en la app, la app abrió Stripe Checkout con
  el precio de $25, y tras la suscripción Stripe envió el evento real, el webhook puso el plan
  `pro` (50,000 tareas) y se activó el botón de IA.
- `npm test`: 48 de 49 tests (el que falla es el problema de imágenes que ya existía).


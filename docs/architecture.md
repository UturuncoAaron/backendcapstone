# EduAula — Arquitectura

> Documento vivo. Cualquier cambio de arquitectura (rol nuevo, estado nuevo
> de cita, regla nueva de matrícula) **se refleja primero acá** y después
> en el código.

---

## 1. Roles y participación en módulos

| Rol         | Citas | Disponibilidad | Asistencias | Notas / Libretas | Comunicados |
|-------------|:-----:|:--------------:|:-----------:|:----------------:|:-----------:|
| `admin`     | ✔ (cita a padre) | — | — | — (lectura) | ✔ |
| `director`  | ✔ (subtipo de admin con cargo `director`) | — | — | — | ✔ |
| `psicologa` | ✔ | ✔ | — | — | ✔ |
| `docente`   | ✔ (solo a padre) | ✔ | ✔ (de sus cursos) | ✔ | ✔ |
| `padre`     | ✔ (a psicóloga / docente de sus hijos) | — | — (lectura) | — (lectura) | — (lectura) |
| `alumno`    | ✔ (solo a psicóloga) | — | — (lectura) | — (lectura) | — (lectura) |
| `auxiliar`  | ✘ | ✘ | ✔ | — | — |

> **Importante**: `auxiliar` está **fuera del módulo de citas**. No puede
> crear citas, no puede declarar disponibilidad, no aparece en selects, no
> recibe citas. Su único rol funcional es asistencias. Esto está reforzado
> en `appointments.rules.ts`, `appointments.types.ts` y en cada decorador
> `@Roles(...)` del controller.

---

## 2. Módulo de Matrículas y Promoción anual

### 2.1. Mejora vs. el modelo previo

El modelo previo asociaba la matrícula a un `periodo` (bimestre). Esto
provocaba:

- Duplicación de matrículas cuando había varios bimestres en el mismo año.
- Imposibilidad de tener historial inmutable por año (cada bimestre tocaba
  la misma fila).
- Promoción manual y propensa a errores.

El nuevo modelo asocia la matrícula a un **año lectivo** (`anios_lectivos`).
La tupla única es `(alumno_id, seccion_id, anio)`. Toda la información
académica (notas, asistencias, informes) referencia la matrícula del año
en el que ocurrió, así que al pasar de año la data del año anterior queda
inmutable por construcción.

### 2.2. Modelo de datos

```text
anios_lectivos
├─ id            (UUID, PK)
├─ anio          (SMALLINT, UNIQUE)            -- 2026, 2027, ...
├─ fecha_inicio  (DATE)
├─ fecha_fin     (DATE)
├─ estado        ('planificado','en_curso','cerrado','archivado')
├─ promocion_ejecutada_at      (TIMESTAMPTZ NULL)
├─ egresados_desactivados_at   (TIMESTAMPTZ NULL)
└─ created_at / updated_at

matriculas
├─ id              (UUID, PK)
├─ alumno_id       (FK → alumnos)
├─ seccion_id      (FK → secciones)
├─ anio            (SMALLINT)                  -- ⚠ NO periodo_id
├─ activo          (BOOLEAN)
├─ condicion_final ('pendiente','aprobado','desaprobado','retirado')
├─ fecha_matricula (DATE)
└─ UNIQUE (alumno_id, seccion_id, anio)
```

### 2.3. Ciclo de vida del año lectivo

```
            ┌──────────────┐
            │ planificado  │  (admin crea el año por adelantado)
            └──────┬───────┘
                   │ activate (manual)
                   ▼
            ┌──────────────┐
            │  en_curso    │  ◄── matrículas activas
            └──────┬───────┘
                   │ runPromotion (manual, idempotente)
                   ▼
            ┌──────────────┐
            │   cerrado    │  ◄── historial inmutable
            └──────┬───────┘
                   │ T + 30 días → cron desactiva cuentas de egresados
                   │ archive (manual)
                   ▼
            ┌──────────────┐
            │  archivado   │
            └──────────────┘
```

### 2.4. Reglas de promoción

Al ejecutar `POST /academic-years/:anio/promotion/run`:

1. Por cada matrícula del `anio` con `condicion_final='aprobado'`:
   - Si `grado.orden < 11` (no es 5to Sec): se crea una nueva matrícula
     para el `anio+1` en `grado.orden+1`, intentando preservar el mismo
     nombre de sección (A → A). La matrícula del año actual queda
     `activo=false` pero NO se borra (historial inmutable).
   - Si `grado.orden = 11` (5to Sec): el alumno es **egresado**. No se
     crea matrícula nueva. La cuenta sigue activa por 30 días para que
     el alumno pueda descargar su libreta, ver informes, etc.

2. Por cada matrícula con `condicion_final='desaprobado'`:
   - Se crea una matrícula nueva para `anio+1` en el **mismo grado y
     sección** (repite el año). La original queda `activo=false`.

3. Las matrículas con `condicion_final='pendiente'` o `'retirado'` no
   se tocan. El admin las resuelve a mano antes de correr la promoción.

4. La operación es **idempotente**: si `promocion_ejecutada_at` ya tiene
   valor, no hace nada y devuelve los contadores existentes.

5. Todo dentro de una transacción `SERIALIZABLE` para que un fallo a la
   mitad no deje el sistema inconsistente.

### 2.5. Desactivación de egresados (T + 30 días)

`POST /academic-years/:anio/egresados/deactivate` (manual) o el cron
`AcademicYearCron.dailyTick` (automático) marcan `cuentas.activo = FALSE`
para los alumnos que aprobaron 5to Sec en ese año.

**Críticamente: no se elimina ningún dato.** La cuenta queda inactiva
(login bloqueado), pero todo su historial académico, informes
psicológicos, asistencias, etc. siguen consultables por admin/director.

El cron solo dispara la desactivación cuando:

- El año está `cerrado`.
- `promocion_ejecutada_at` ya tiene valor.
- `egresados_desactivados_at` es NULL (idempotente).
- Han pasado al menos 30 días desde `fecha_fin`.

---

## 3. Módulo de Derivaciones a Psicología

Cambió respecto a v1: ya no es el admin quien deriva. **Cualquier docente**
puede derivar a un alumno a la psicóloga con `POST /appointments/derivar`.

### 3.1. Flujo

1. Docente abre la vista de su lista de alumnos.
2. Selecciona alumno, escribe motivo.
3. BE crea una cita con `tipo='psicologico'` y `estado='pendiente'`
   apuntando a la psicóloga, en el primer slot libre que la psicóloga
   tenga disponible (o el que el docente eligió del calendario).
4. La psicóloga ve el caso como alerta en su panel y maneja la cita
   con el flujo normal de citas.

### 3.2. Por qué no creamos una tabla `derivaciones` aparte

La derivación es **una cita** desde el primer momento. Crear una entidad
separada multiplicaría estados (pendiente/aceptada/atendida) que ya
existen en la máquina de estados de citas. El campo `tipo='psicologico'`
+ `created_by_rol='docente'` ya distingue el caso para los reportes.

---

## 4. Sistema de Citas

### 4.1. Reglas por rol

`appointments.rules.ts`:

| Rol          | Slot   | Duración fija | Máx slots | Días                  |
|--------------|:------:|:-------------:|:---------:|-----------------------|
| `psicologa`  | 30 min | variable      | 2 (60 min) | L–V                   |
| `docente`    | 45 min | **fija 45**   | 1         | L–V                   |
| `director`   | 15 min | variable      | 2 (30 min) | Martes y jueves       |
| `admin`      | 15 min | variable      | 2 (30 min) | L–V                   |
| `padre`      | 30 min | —             | 2         | L–V (sin disponibilidad propia) |

### 4.2. Máquina de estados

```
                    create
                       │
                       ▼
                  ┌─────────┐
        rechazar  │pendiente│  cancelar
       ◄──────────┤         ├──────────►  cancelada
                  │         │
                  │ aplazar │
                  │ ┌──────┐│
                  │ │ self ││  (vuelve a pendiente con nueva fecha)
                  │ └──────┘│
                  │  confirmar
                  │    │
                  │    ▼
                  └────────┐
                           │
                  ┌────────┴────┐
                  │ confirmada  │
                  └────┬────────┘
                       │  realizar / no_asistir / cancelar / aplazar
        ┌──────────────┼────────────────────────┬──────────────┐
        ▼              ▼                        ▼              ▼
   realizada      no_asistio              cancelada      (→ pendiente)
```

`appointments.types.ts` → `APPOINTMENT_STATUSES = ['pendiente',
'confirmada', 'realizada', 'cancelada', 'rechazada', 'no_asistio']`.

Cada transición se loguea en `cita_estado_log` (inmutable, append-only).

### 4.3. Quién puede citar a quién

`appointments.rules.ts` → `INVITATION_MATRIX`:

```
docente   → padre
psicologa → alumno, padre (autocompleta padre vía padre_alumno)
padre     → psicologa, docente
alumno    → psicologa
admin     → padre
auxiliar  → ✘ (no participa)
```

### 4.4. Resolución de duración (FIX del bug 2026-05)

Antes el sistema usaba la regla del **convocado** para resolver la
duración. Esto rompía el flujo docente → padre: la regla del padre dice
"slot=30, múltiplo de 30", pero el docente tiene `fixedDurationMin=45`.

Ahora la regla es:

```ts
if (callerOwnsSchedule(caller.rol)) {
  // psicologa / docente / admin / director ⇒ la cita usa el calendario
  // y duración del convocador.
  rule = getAppointmentRule(callerRole);
} else {
  // padre / alumno ⇒ no tienen calendario propio, se acoplan al del
  // convocado (psicóloga o docente).
  rule = getAppointmentRule(convocadoRole);
}
```

### 4.5. Aplazamiento

`PATCH /appointments/:id/aplazar` ahora es accesible para:

- **Convocador** (psicóloga / docente / admin / director): re-propone
  horario dentro de su propia disponibilidad. La cita vuelve a
  `pendiente`; el convocado re-confirma.
- **Convocado** (padre / alumno): contra-propone horario dentro de la
  disponibilidad del convocador. La cita vuelve a `pendiente`; el
  convocador re-confirma.
- **Admin** sin ser parte: puede aplazar cualquier cita (uso operativo).

En cualquier caso `motivo` es obligatorio (>= 3 caracteres). Cada
aplazamiento queda en `cita_estado_log.razon` y en `citas.prior_notes`.

### 4.6. Endpoint `GET /appointments/teachers/bookable`

Endpoint role-aware para resolver el bug del dropdown vacío del padre.

- **padre**: devuelve solo los docentes que dictan curso a sus hijos
  o son tutores de su sección.
- **admin / psicologa**: devuelve todos los docentes activos.
- **resto**: 403 (incluye `docente` — un docente no convoca a otro
  docente).

El FE del padre debe consumir este endpoint en vez de
`admin/users/docentes/select` (que es admin-only y devolvía 403 →
dropdown vacío).

---

## 5. Backend — patrones transversales

- **`@nestjs/schedule`** para crons (limpieza de notificaciones, cron
  diario de año lectivo).
- **`@nestjs/event-emitter`** para desacoplar productores de notificaciones
  (citas/comunicados/tareas) de consumidores (`NotificationsListener`).
- **`SchemaSync`** (idempotente, `OnApplicationBootstrap`) en módulos
  con esquema evolutivo (`AppointmentsSchemaSync`,
  `AcademicYearSchemaSync`). Reemplaza a las migraciones de TypeORM
  porque el proyecto corre `synchronize: false`.
- **Transacciones SERIALIZABLE** para todo lo que toca más de una fila
  crítica (creación de cita, promoción anual). Idempotencia explícita
  con timestamps (`promocion_ejecutada_at`, `egresados_desactivados_at`).
- **Auditoría inmutable** en `cita_estado_log`. Cualquier transición de
  cita deja huella con `changed_by_id`, `razon`, `changed_at`.

---

## 6. Frontend — patrones transversales

- **Signals** para estado local (Angular 20+).
- **Material Design** + **`appointment-dialog-panel`** custom para los
  dialogs grandes (request / postpone / reschedule).
- **`canPostpone(a)`** y similares como guards puros en el componente
  para decidir si mostrar/deshabilitar botones según `estado` y rol del
  usuario logueado.
- El dialog del padre debe llamar `GET /appointments/teachers/bookable`
  en vez de `admin/users/docentes/select`.

---

## 7. Escalabilidad a varios años (2026 → 2027 → 2028 …)

- Los años no se hardcodean en ningún lado. Todo lee de `anios_lectivos`
  o de `Period.anio` (que ahora es un atributo del año lectivo).
- El admin puede tener varios años `planificado` en simultáneo (preparar
  2027 mientras 2026 está `en_curso`), pero **solo uno** puede estar
  `en_curso` al mismo tiempo (`activate` lo valida).
- La promoción es por `anio` específico: `POST /academic-years/:anio/
  promotion/run`. Si en algún año la promoción quedó pendiente, el admin
  la puede correr después; el cron no la fuerza.
- La desactivación de cuentas de egresados es por año específico también.
  El cron diario recorre TODOS los años cerrados con
  `egresados_desactivados_at IS NULL`, así que si por algún motivo un
  año quedó sin desactivar (servidor caído, etc.), se procesa el próximo
  tick.

### 7.1. Extender para un nuevo rol

1. Agregar el rol en `auth/types/auth-user.ts` (`Rol`).
2. Decidir si participa en citas:
   - Si tiene calendario: agregar a `ROLES_WITH_AVAILABILITY` y crear
     entry en `APPOINTMENT_RULES`.
   - Si solo cita pasivamente: agregar a `INVITATION_MATRIX` solo
     como `RecipientRol`.
3. Agregar el rol en `@Roles(...)` de los endpoints relevantes.
4. Actualizar la matriz en `docs/architecture.md`.

### 7.2. Cambiar las duraciones de slot

Editar `APPOINTMENT_RULES` en `appointments.rules.ts`. El FE las consume
vía `GET /appointments/rules/:targetId` para que las validaciones
client-side queden sincronizadas automáticamente.

### 7.3. Cambiar la ventana de desactivación de egresados (default 30 días)

Editar la constante en `AcademicYearService.runEgresadoDeactivation`
(busca `diffDias < 30`) y en `AcademicYearCron`
(`INTERVAL '30 days'`). Mantener sincronizados.

---

## 8. Test plan recomendado

> No incluido en este PR — backlog priorizado para sprints siguientes.

1. **`AcademicYearService.runPromotion`** unit tests con BD en memoria:
   - Aprobados → matrícula nueva en grado+1.
   - 5to Sec aprobado → egresado, sin matrícula nueva.
   - Desaprobado → repite mismo grado.
   - Idempotencia (correr dos veces no duplica matrículas).
   - Rollback ante fallo intermedio.
2. **`AppointmentsService.createAppointment`** matriz role × role.
3. **`AppointmentsService.postponeAppointment`** para cada combinación
   convocador/convocado/admin.
4. **`AppointmentsService.listBookableTeachers`** para cada rol.

# EduAula — Mapa de Pendientes
## Fecha: Abril 2026

---

## BACKEND (NestJS)

### ✅ Completado
- users (cuentas, alumnos, docentes, padres, admins)
- auth (JWT, guards, decoradores)
- tasks (tareas, preguntas, opciones, entregas, autocorrección)
- libretas
- parent-portal
- grades (notas)
- academic (grados, secciones, periodos, matrículas)
- courses (cursos, enrollment, asignación docentes)
- announcements (comunicados)
- forum (foros, posts) — migrado a v5
- live-classes (clases en vivo, asistencias)

### ⚠️ Correcciones pendientes (backend)
1. forum → `foro_posts.usuario_id` aún referencia `User` (tabla vieja)
   - Cambiar a `Cuenta` entity
2. live-classes → `registrado_por` referencia `cuentas.id` — verificar que el guard pasa el id correcto
3. reports → queries apuntan a `usuarios` — migrar a tablas específicas
4. users.controller → agregar `GET /admin/users/padres/search` (ya tiene alumnos y docentes pero falta padres)
5. users.service → `getStats()` no cuenta admins — agregar COUNT de admins
6. auth.service → `getPerfil()` usa `SELECT * FROM admins WHERE id = $1` con raw query, debería usar el repo

### ❌ Módulos no iniciados (backend)
- reports → reescribir queries apuntando a tablas v5
- materials → revisar si existe o crear desde cero
- storage → confirmar integración R2 con Cloudflare

---

## FRONTEND (Angular)

### ✅ Funcionando hoy
- Login
- Admin dashboard (stats)
- Gestión de usuarios — Admins tab (lista, crear)
- Gestión de usuarios — Alumnos tab (lista, crear)
- Gestión de usuarios — Docentes tab (lista, crear)
- Gestión de usuarios — Padres tab (lista, crear)
- Vincular padre-hijo (parent-child-link) — búsqueda corregida

### 🐛 Bugs conocidos activos
1. `empty-links.svg` 404 — asset inexistente en parent-child-link
   - Fix: reemplazar con `<mat-icon>` de Material
2. Tab admins no muestra el admin logueado como "otro admin"
   - Comportamiento esperado: ¿mostrarlo o no? Definir
3. Stats de admins siempre en 0
   - Fix: `getStats()` en backend no cuenta admins

### 📋 Vistas/módulos frontend por integrar

#### ADMIN
| Vista | Ruta Angular | API que consume | Estado |
|-------|-------------|-----------------|--------|
| Dashboard | /admin/dashboard | GET /admin/users/stats | ✅ |
| Gestión usuarios | /admin/users | CRUD /admin/users/* | ✅ |
| Ver detalle usuario | /admin/users/:id | GET /admin/users/alumnos/:id | ❌ sin implementar |
| Vincular padre-hijo | /admin/parent-child | POST /admin/users/parent-child | 🔧 en progreso |
| Setup académico | /admin/academic | GET/POST /academic/* | ❓ verificar |
| Comunicados | /admin/announcements | GET/POST /announcements | ❓ verificar |
| Reportes | /admin/reports | GET /admin/reports/* | ❌ backend no listo |
| Importar alumnos | /admin/import | POST /admin/import/students | ❓ verificar |

#### DOCENTE
| Vista | Ruta Angular | API que consume | Estado |
|-------|-------------|-----------------|--------|
| Dashboard docente | /docente/dashboard | GET /auth/profile | ❓ verificar |
| Mis cursos | /docente/courses | GET /courses | ❓ verificar |
| Detalle curso | /docente/courses/:id | GET /courses/:id | ❓ verificar |
| Crear tarea | /docente/courses/:id/tasks | POST /courses/:id/tasks | ❓ verificar |
| Ver entregas | /docente/tasks/:id/submissions | GET /tasks/:id/submissions | ❓ verificar |
| Calificar entrega | — | PATCH /submissions/:id/grade | ❓ verificar |
| Registrar notas | /docente/grades | POST /grades | ❓ verificar |
| Foro del curso | /docente/courses/:id/forum | GET/POST /courses/:id/forums | ❓ verificar |
| Clases en vivo | /docente/courses/:id/live | GET/POST /courses/:id/live-classes | ❓ verificar |
| Asistencia | /docente/live-classes/:id/attendance | POST /live-classes/:id/attendance | ❓ verificar |
| Materiales | /docente/courses/:id/materials | GET/POST /courses/:id/materials | ❓ verificar |

#### ALUMNO
| Vista | Ruta Angular | API que consume | Estado |
|-------|-------------|-----------------|--------|
| Dashboard alumno | /alumno/dashboard | GET /auth/profile | ❓ verificar |
| Mis cursos | /alumno/courses | GET /courses | ❓ verificar |
| Tarea/examen | /alumno/tasks/:id | GET /tasks/:id | ❓ verificar |
| Entregar tarea | — | POST /tasks/:id/submit | ❓ verificar |
| Ver mis notas | /alumno/grades | GET /grades/my | ❓ verificar |
| Mi libreta | /alumno/libreta | GET /libretas/me | ❓ verificar |
| Foro | /alumno/courses/:id/forum | GET/POST /courses/:id/forums | ❓ verificar |

#### PADRE
| Vista | Ruta Angular | API que consume | Estado |
|-------|-------------|-----------------|--------|
| Dashboard padre | /padre/dashboard | GET /auth/profile | ❓ verificar |
| Ver hijos | /padre/children | GET /parent/children | ❓ verificar |
| Notas del hijo | /padre/children/:id/grades | GET /parent/children/:id/grades | ❓ verificar |
| Asistencia del hijo | /padre/children/:id/attendance | GET /parent/children/:id/attendance | ❓ verificar |
| Libreta del hijo | /padre/children/:id/libreta | GET /parent/children/:id/libretas | ❓ verificar |

---

## PRIORIDAD SUGERIDA

### Esta semana
1. Fix `empty-links.svg` en parent-child-link
2. Fix `getStats()` para contar admins
3. Terminar flujo vincular padre-hijo (probar submit)
4. Verificar vistas de docente (las más críticas para el colegio)

### Próxima semana
5. Reescribir módulo `reports` en backend
6. Verificar e integrar vistas de alumno
7. Verificar e integrar vistas de padre
8. Materiales y storage R2

### Antes de producción
9. Paginación server-side en tablas con muchos registros
10. Tests de carga básicos
11. Variables de entorno en producción (Hetzner)
12. Configurar CORS para dominio final

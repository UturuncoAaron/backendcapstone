/**
 * Forma del usuario que el JwtAuthGuard adjunta a `request.user`
 * (lo devuelve `JwtStrategy.validate()`).
 *
 * Usar en cada controller/service que reciba `@CurrentUser()`:
 *
 *   @CurrentUser() user: AuthUser
 *
 * En lugar de `user: any` o de redeclarar la interface inline.
 */
export type Rol =
  | 'alumno'
  | 'docente'
  | 'admin'
  | 'padre'
  | 'psicologa'
  | 'auxiliar';

export interface AuthUser {
  /** UUID de `cuentas.id` (el dueño del JWT). */
  id: string;
  rol: Rol;
  tipo_documento: string;
  numero_documento: string;
}

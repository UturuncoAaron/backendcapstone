export type Rol =
  | 'alumno'
  | 'docente'
  | 'admin'
  | 'padre'
  | 'psicologa'
  | 'staff';

export interface AuthUser {
  id: string;
  rol: Rol;
  tipo_documento: string;
  numero_documento: string;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AcademicYearStatus =
  | 'planificado'
  | 'en_curso'
  | 'cerrado'
  | 'archivado';

/**
 * Año lectivo escolar — fuente única de verdad para la temporalidad
 * académica anual (matrícula, promoción, desactivación de egresados).
 *
 * NO depende de `periodos` (bimestres). Un `anio_lectivo` agrupa los
 * bimestres del mismo año calendario pero la lógica de cierre/promoción
 * vive aquí.
 *
 * Estados:
 *   planificado → el año todavía no inicia (admin lo creó por adelantado).
 *   en_curso    → fecha_inicio ≤ hoy ≤ fecha_fin. Matrículas activas.
 *   cerrado     → fecha_fin pasada, promoción ejecutada, historial inmutable.
 *   archivado   → cerrado hace mucho; pasa a una vista de solo lectura
 *                 (placeholder por si se quiere mover a otra tabla).
 *
 * Transiciones permitidas:
 *   planificado → en_curso  (manual o cron al llegar fecha_inicio)
 *   en_curso    → cerrado    (manual desde admin, dispara promoción)
 *   cerrado     → archivado  (manual)
 *
 * El cron diario `EnrollmentLifecycleService.dailyTick`:
 *   - cuando estado='en_curso' y NOW() > fecha_fin → propone cerrar (no
 *     fuerza, el admin decide cuándo correr la promoción).
 *   - cuando estado='cerrado' y NOW() ≥ fecha_fin + INTERVAL '30 days'
 *     y egresados_desactivados_at IS NULL → desactiva egresados de 5to.
 */
@Entity('anios_lectivos')
export class AcademicYear {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'smallint', unique: true })
  anio: number;

  @Column({ name: 'fecha_inicio', type: 'date' })
  fechaInicio: string;

  @Column({ name: 'fecha_fin', type: 'date' })
  fechaFin: string;

  @Column({ length: 20, default: 'planificado' })
  estado: AcademicYearStatus;

  @Column({
    name: 'promocion_ejecutada_at',
    type: 'timestamptz',
    nullable: true,
  })
  promocionEjecutadaAt: Date | null;

  @Column({
    name: 'egresados_desactivados_at',
    type: 'timestamptz',
    nullable: true,
  })
  egresadosDesactivadosAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const errorRate = new Rate('error_rate');
const loginDuration = new Trend('login_duration', true);
const getDuration = new Trend('get_duration', true);
const postDuration = new Trend('post_duration', true);
const failedRequests = new Counter('failed_requests');

export const options = {
    stages: [
        { duration: '20s', target: 5 },
        { duration: '40s', target: 20 },
        { duration: '30s', target: 50 },
        { duration: '1m', target: 50 },
        { duration: '20s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<800'],
        error_rate: ['rate<0.10'],
        'http_req_duration{type:login}': ['p(99)<2000'],
        'http_req_duration{type:get}': ['p(95)<500'],
        'http_req_duration{type:post}': ['p(95)<1000'],
    },
};

const BASE = 'http://localhost:3000/api';
const H = { 'Content-Type': 'application/json' };

const IDS = {
    admin: { id: 'b0df1522-c528-4455-a24b-7f177a1d6cc3', doc: '00000001', pass: '123456' },
    padre: { id: '31df5b08-22d7-409c-a64d-ad83e6af5fed', doc: '33333333', pass: 'padre123' },
    alumno: { id: '33abad63-faa6-484f-99b0-cd35bcdb848d', doc: '22222222', pass: 'alumno123' },
    docente: { id: '51e96268-f3df-4356-b57b-5bce82a75c15', doc: '11111111', pass: 'docente123' },
};

const PERIODO_ID = 1;

export function setup() {
    console.log('\n📦 Iniciando seed de datos...\n');

    const adminToken = login(IDS.admin.doc, IDS.admin.pass);
    if (!adminToken) throw new Error('❌ Login admin falló');
    const aH = { ...H, Authorization: `Bearer ${adminToken}` };

    // Crear sección
    let seccionId = null;
    const secRes = http.post(`${BASE}/academic/secciones`, JSON.stringify({
        grado_id: 1, nombre: 'A', capacidad: 35,
    }), { headers: aH });

    if (secRes.status === 201 || secRes.status === 200) {
        seccionId = JSON.parse(secRes.body).data?.seccion?.id;
        console.log(`✅ Sección creada: ${seccionId}`);
    } else {
        const listRes = http.get(`${BASE}/academic/secciones`, { headers: aH });
        const listData = JSON.parse(listRes.body).data;
        const secciones = Array.isArray(listData) ? listData : (listData?.secciones ?? []);
        if (secciones.length > 0) {
            seccionId = secciones[0].id;
            console.log(`ℹ️  Sección existente: ${seccionId}`);
        }
    }
    if (!seccionId) throw new Error('❌ No se pudo obtener seccionId');

    // Asignar tutor
    http.patch(`${BASE}/academic/secciones/${seccionId}/tutor`,
        JSON.stringify({ tutor_id: IDS.docente.id }), { headers: aH });

    // Matricular alumno
    http.post(`${BASE}/courses/enroll`, JSON.stringify({
        alumno_id: IDS.alumno.id,
        seccion_id: seccionId,
        periodo_id: PERIODO_ID,
    }), { headers: aH });
    console.log(`✅ Alumno matriculado`);

    // Vincular padre-alumno
    http.post(`${BASE}/admin/users/parent-child`, JSON.stringify({
        padre_id: IDS.padre.id,
        alumno_id: IDS.alumno.id,
    }), { headers: aH });
    console.log(`✅ Padre vinculado`);

    // Cursos generados automáticamente al crear sección

    // Obtener primer curso
    const cursosRes = http.get(`${BASE}/courses`, { headers: aH });
    const cursos = JSON.parse(cursosRes.body).data;
    let cursoId = Array.isArray(cursos) && cursos.length > 0 ? cursos[0].id : null;
    console.log(`✅ Curso: ${cursoId}`);

    // Crear anuncio
    http.post(`${BASE}/announcements`, JSON.stringify({
        titulo: 'Bienvenidos al I Bimestre 2026',
        contenido: 'El año escolar ha iniciado correctamente.',
        destinatario: 'todos',
    }), { headers: aH });
    console.log(`✅ Anuncio creado`);

    // Login docente y crear tarea
    const docenteToken = login(IDS.docente.doc, IDS.docente.pass);
    let tareaId = null;
    let conversacionId = null;

    if (docenteToken && cursoId) {
        const dH = { ...H, Authorization: `Bearer ${docenteToken}` };

        const tareaRes = http.post(`${BASE}/courses/${cursoId}/tasks`, JSON.stringify({
            titulo: 'Tarea Semana 1 — Introducción',
            instrucciones: 'Leer el capítulo 1 y responder las preguntas.',
            bimestre: 1,
            semana: 1,
            fecha_limite: '2026-12-31T23:59:00.000Z',
            puntos_max: 20,
            permite_texto: true,
        }), { headers: dH });

        if (tareaRes.status === 201 || tareaRes.status === 200) {
            tareaId = JSON.parse(tareaRes.body).data?.id;
            console.log(`✅ Tarea creada: ${tareaId}`);
            if (tareaId) http.patch(`${BASE}/tasks/${tareaId}/toggle`, null, { headers: dH });
        }

        // Crear conversación docente → padre
        const convRes = http.post(`${BASE}/messaging/conversations`, JSON.stringify({
            tipo: 'academico',
            studentId: IDS.alumno.id,
            participantIds: [IDS.padre.id],
        }), { headers: dH });

        if (convRes.status === 201 || convRes.status === 200) {
            conversacionId = JSON.parse(convRes.body).data?.id;
            console.log(`✅ Conversación creada: ${conversacionId}`);
        }
    }

    console.log('\n✅ Seed completo — iniciando stress test...\n');
    return { adminToken, docenteToken, seccionId, cursoId, tareaId, conversacionId };
}

export default function (data) {
    const roles = ['admin', 'docente', 'alumno', 'padre'];
    const role = roles[Math.floor(Math.random() * roles.length)];
    const user = IDS[role];

    // Login
    let token;
    group('01_login', () => {
        const start = Date.now();
        const res = http.post(`${BASE}/auth/login`, JSON.stringify({
            tipo_documento: 'dni',
            numero_documento: user.doc,
            password: user.pass,
        }), { headers: H, tags: { type: 'login' } });
        loginDuration.add(Date.now() - start);

        const ok = check(res, {
            'login 200': r => r.status === 200,
            'tiene token': r => { try { return !!JSON.parse(r.body).data?.token; } catch { return false; } },
        });
        errorRate.add(ok ? 0 : 1);
        if (!ok) { failedRequests.add(1); return; }
        token = JSON.parse(res.body).data.token;
    });

    if (!token) { sleep(1); return; }
    const aH = { ...H, Authorization: `Bearer ${token}` };

    // GETs comunes
    group('02_comunes', () => {
        req('GET', `${BASE}/announcements`, null, aH, 'get');
        sleep(0.2);
        req('GET', `${BASE}/notifications`, null, aH, 'get');
        sleep(0.2);
        req('GET', `${BASE}/notifications/unread-count`, null, aH, 'get');
        sleep(0.2);
        req('GET', `${BASE}/messaging/conversations`, null, aH, 'get');
    });

    sleep(0.3);

    if (role === 'admin') {
        group('03_admin', () => {
            req('GET', `${BASE}/admin/users/stats`, null, aH, 'get');
            sleep(0.2);
            req('GET', `${BASE}/admin/users/alumnos`, null, aH, 'get');
            sleep(0.2);
            req('GET', `${BASE}/admin/users/docentes`, null, aH, 'get');
            sleep(0.2);
            req('GET', `${BASE}/academic/periodos`, null, aH, 'get');
            sleep(0.2);
            req('GET', `${BASE}/academic/secciones`, null, aH, 'get');
        });
    }

    if (role === 'docente') {
        group('03_docente', () => {
            const cursosRes = req('GET', `${BASE}/courses`, null, aH, 'get');
            sleep(0.2);
            req('GET', `${BASE}/academic/tutoria/me`, null, aH, 'get');
            sleep(0.2);

            try {
                const cursos = JSON.parse(cursosRes.body).data;
                if (Array.isArray(cursos) && cursos.length > 0) {
                    const cid = cursos[0].id;
                    req('GET', `${BASE}/courses/${cid}`, null, aH, 'get');
                    sleep(0.2);
                    req('GET', `${BASE}/courses/${cid}/materials`, null, aH, 'get');
                    sleep(0.2);
                    req('GET', `${BASE}/grades/course/${cid}`, null, aH, 'get');
                    sleep(0.2);
                    req('GET', `${BASE}/courses/${cid}/tasks`, null, aH, 'get');
                    sleep(0.3);

                    // POST nota
                    req('POST', `${BASE}/grades`, JSON.stringify({
                        alumno_id: IDS.alumno.id,
                        curso_id: cid,
                        periodo_id: PERIODO_ID,
                        nota_tareas: parseFloat((Math.random() * 8 + 12).toFixed(1)),
                        nota_participacion: parseFloat((Math.random() * 5 + 15).toFixed(1)),
                        nota_final: parseFloat((Math.random() * 8 + 12).toFixed(1)),
                    }), aH, 'post');
                    sleep(0.2);

                    // POST cita
                    req('POST', `${BASE}/psychology/appointments`, JSON.stringify({
                        parentId: IDS.padre.id,
                        studentId: IDS.alumno.id,
                        tipo: 'academico',
                        modalidad: 'presencial',
                        motivo: 'Revisión de rendimiento',
                        scheduledAt: '2026-12-15T10:00:00.000Z',
                        durationMin: 30,
                    }), aH, 'post');
                }
            } catch (_) { }

            // POST mensaje
            if (data.conversacionId) {
                req('POST', `${BASE}/messaging/conversations/${data.conversacionId}/messages`,
                    JSON.stringify({ contenido: `Consulta sobre el alumno — ${Date.now()}` }),
                    aH, 'post');
            }
        });
    }

    if (role === 'alumno') {
        group('03_alumno', () => {
            const cursosRes = req('GET', `${BASE}/courses`, null, aH, 'get');
            sleep(0.2);
            req('GET', `${BASE}/grades/my`, null, aH, 'get');
            sleep(0.2);
            req('GET', `${BASE}/my-submissions`, null, aH, 'get');
            sleep(0.2);
            req('GET', `${BASE}/libretas/me`, null, aH, 'get');
            sleep(0.2);

            try {
                const cursos = JSON.parse(cursosRes.body).data;
                if (Array.isArray(cursos) && cursos.length > 0) {
                    const cid = cursos[0].id;
                    req('GET', `${BASE}/courses/${cid}/tasks`, null, aH, 'get');
                    sleep(0.2);

                    if (data.tareaId) {
                        req('POST', `${BASE}/tasks/${data.tareaId}/submit`, JSON.stringify({
                            respuesta_texto: `Respuesta de prueba ${Date.now()}`,
                        }), aH, 'post');
                    }
                }
            } catch (_) { }

            req('PATCH', `${BASE}/notifications/read-all`, null, aH, 'post');
        });
    }

    if (role === 'padre') {
        group('03_padre', () => {
            const hijosRes = req('GET', `${BASE}/parent/children`, null, aH, 'get');
            sleep(0.2);
            req('GET', `${BASE}/psychology/appointments/parent`, null, aH, 'get');
            sleep(0.2);

            try {
                const hijos = JSON.parse(hijosRes.body).data;
                if (Array.isArray(hijos) && hijos.length > 0) {
                    const hid = hijos[0].id;
                    req('GET', `${BASE}/parent/children/${hid}/grades`, null, aH, 'get');
                    sleep(0.2);
                    req('GET', `${BASE}/parent/children/${hid}/attendance`, null, aH, 'get');
                    sleep(0.2);
                    req('GET', `${BASE}/parent/children/${hid}/libretas`, null, aH, 'get');
                }
            } catch (_) { }

            if (data.conversacionId) {
                req('POST', `${BASE}/messaging/conversations/${data.conversacionId}/read`,
                    null, aH, 'post');
            }
        });
    }

    sleep(Math.random() * 2 + 1);
}

function req(method, url, body, headers, type) {
    const start = Date.now();
    const params = { headers, tags: { type } };
    const res = method === 'GET'
        ? http.get(url, params)
        : http.request(method, url, body ?? null, params);
    const dur = Date.now() - start;
    type === 'get' ? getDuration.add(dur) : postDuration.add(dur);
    const ok = check(res, {
        [`${method} ${url.split('/api/')[1]?.substring(0, 40)} 2xx`]: r => r.status >= 200 && r.status < 300,
    });
    errorRate.add(ok ? 0 : 1);
    if (!ok) failedRequests.add(1);
    return res;
}

function login(doc, pass) {
    const res = http.post(`${BASE}/auth/login`, JSON.stringify({
        tipo_documento: 'dni', numero_documento: doc, password: pass,
    }), { headers: H, timeout: '10s' });

    if (res.status !== 200) {
        console.log(`Login falló para ${doc} — status: ${res.status} — body: ${res.body}`);
        return null;
    }

    try { return JSON.parse(res.body).data?.token ?? null; }
    catch { return null; }
}

export function handleSummary(data) {
    const m = data.metrics;
    const fmt = v => v != null ? v.toFixed(2) : 'N/A';
    console.log('\n════════════════════════════════════════════════');
    console.log('          EDUAULA — STRESS TEST RESULTS         ');
    console.log('════════════════════════════════════════════════');
    console.log(`  Total requests  : ${m.http_reqs?.values?.count ?? 0}`);
    console.log(`  Failed requests : ${m.failed_requests?.values?.count ?? 0}`);
    console.log(`  Error rate      : ${((m.error_rate?.values?.rate ?? 0) * 100).toFixed(2)}%`);
    console.log(`  Req/s           : ${fmt(m.http_reqs?.values?.rate)}`);
    console.log('────────────────────────────────────────────────');
    console.log(`  Response avg    : ${fmt(m.http_req_duration?.values?.avg)} ms`);
    console.log(`  Response p95    : ${fmt(m.http_req_duration?.values['p(95)'])} ms`);
    console.log(`  Response p99    : ${fmt(m.http_req_duration?.values['p(99)'])} ms`);
    console.log('────────────────────────────────────────────────');
    console.log(`  Login avg       : ${fmt(m.login_duration?.values?.avg)} ms`);
    console.log(`  GET avg         : ${fmt(m.get_duration?.values?.avg)} ms`);
    console.log(`  POST avg        : ${fmt(m.post_duration?.values?.avg)} ms`);
    console.log('════════════════════════════════════════════════\n');
    return {
        'stress-tests/results.json': JSON.stringify(data, null, 2),
        stdout: '✅ Resultados guardados en stress-tests/results.json\n',
    };
}
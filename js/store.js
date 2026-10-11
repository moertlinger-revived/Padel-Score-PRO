/**
 * store.js — Puente entre el motor y la UI, y sincronización con Firebase
 * v3.0 — Con temporizadores, clima, descansos, mensaje dinámico, reloj, torneo y pantalla oculta
 */
document.addEventListener('alpine:init', () => {
    Alpine.store('match', {
        engine: new PadelScoreEngine(),
        names: { A: ['J1A', 'J1B'], B: ['J2A', 'J2B'] },
        syncing: false,
        isBoard: false,

        temperature: null,
        weatherLoaded: false,
        currentTime: '',

        // Torneo
        torneo: '',
        categoria: '',

        // Pantalla oculta
        pantallaOculta: false,
        mensajePantalla: '',

        init() {
            this.isBoard = window.location.pathname.includes('tablero');
            this.bindFirebase();
            this.startClock();
            if (this.isBoard) {
                this.startBoardTimer();
                this.loadWeather();
            } else {
                this.startTimer();
            }
        },

        /* ============================================================
           ACCIONES
           ============================================================ */
        addPoint(team) {
            if (this.engine.matchOver) return;
            if (this.engine.servingPlayer === null) {
                this.engine.message = 'ELIGE SACADOR ANTES DE ANOTAR';
                this.persist();
                return;
            }
            this.engine.addPoint(team);
            if (!this.engine.runP && !this.engine.matchOver && !this.engine.runDescanso) {
                this.engine.message = 'PARTIDO PAUSADO';
            }
            this.persist();
            if (navigator.vibrate) navigator.vibrate(30);
        },

        undo() {
            if (this.engine.undo()) this.persist();
        },

        reset() {
            if (!confirm('¿RESET TOTAL del partido?')) return;
            this.engine.reset();
            this.names = { A: ['J1A', 'J1B'], B: ['J2A', 'J2B'] };
            db.ref('marcador').remove();
            this.persist();
        },

        setFirstServer(playerIndex) {
            this.engine.setFirstServer(playerIndex);
            this.persist();
        },

        setServer(playerIndex) {
            this.engine.setServer(playerIndex);
            this.persist();
        },

        setName(team, playerIdx, name) {
            this.names[team][playerIdx] = name.toUpperCase();
            this.persist();
        },

        setRule(rule, value) {
            this.engine.options[rule] = value;
            this.persist();
        },

        cicloSTB() {
            const opciones = [0, 10, 11];
            const actual = this.engine.options.superTieBreak;
            const idx = opciones.indexOf(actual);
            const next = opciones[(idx + 1) % opciones.length];
            this.engine.options.superTieBreak = next;
            this.persist();
        },

        aceptarDescanso() {
            this.engine.aceptarDescanso();
            this.persist();
            if (navigator.vibrate) navigator.vibrate(50);
        },

        /* ============================================================
           TORNEO
           ============================================================ */
        setTorneo(nombre, categoria) {
            this.torneo = (nombre || '').toUpperCase();
            this.categoria = (categoria || '').toUpperCase();
            db.ref('marcador/torneo').set({
                nombre: this.torneo,
                categoria: this.categoria,
            });
            localStorage.setItem('padel_torneo', JSON.stringify({
                nombre: this.torneo,
                categoria: this.categoria,
            }));
        },

        /* ============================================================
           PANTALLA OCULTA
           ============================================================ */
        setMensajePantalla(texto) {
            this.mensajePantalla = texto || '';
            this.pantallaOculta = this.mensajePantalla.trim() !== '';
            db.ref('marcador/pantalla').set({
                oculta: this.pantallaOculta,
                mensaje: this.mensajePantalla,
            });
            localStorage.setItem('padel_pantalla', JSON.stringify({
                oculta: this.pantallaOculta,
                mensaje: this.mensajePantalla,
            }));
        },

        mostrarTablero() {
            this.pantallaOculta = false;
            this.mensajePantalla = '';
            db.ref('marcador/pantalla').set({
                oculta: false,
                mensaje: '',
            });
            localStorage.setItem('padel_pantalla', JSON.stringify({
                oculta: false,
                mensaje: '',
            }));
        },

        /* ============================================================
           TEMPORIZADOR
           ============================================================ */
        startTimer() {
            setInterval(() => {
                if (this.isBoard) return;
                let changed = false;

                if (this.engine.runP) {
                    this.engine.segP++;
                    changed = true;
                }

                if (this.engine.runPel && this.engine.segPel > 0) {
                    this.engine.segPel--;
                    changed = true;
                    if (this.engine.segPel === 0) this.engine.runPel = false;
                }

                if (this.engine.runDescanso && this.engine.segDescanso > 0) {
                    this.engine.segDescanso--;
                    changed = true;
                    if (this.engine.segDescanso === 0) {
                        this.engine.runDescanso = false;
                        this.engine.motivoDescanso = '';
                        this.engine.message = this.engine.mode === 'TIE-BREAK' ? 'TIE-BREAK' : 'EN JUEGO';
                    }
                }

                if (changed) this.persist();
            }, 1000);
        },

        startBoardTimer() {
            setInterval(() => {
                if (!this.isBoard) return;
                if (this.engine.runDescanso && this.engine.segDescanso > 0) {
                    this.engine.segDescanso--;
                    if (this.engine.segDescanso === 0) {
                        this.engine.runDescanso = false;
                        this.engine.motivoDescanso = '';
                    }
                }
            }, 1000);
        },

        toggleTimer(t) {
            if (t === 'partido') {
                this.engine.runP = !this.engine.runP;
                if (this.engine.runP) {
                    this.engine.message = this.engine.mode === 'TIE-BREAK' ? 'TIE-BREAK' : 'EN JUEGO';
                } else {
                    this.engine.message = 'PARTIDO PAUSADO';
                }
            } else {
                this.engine.runPel = !this.engine.runPel;
            }
            this.persist();
        },

        resetTimer(t) {
            if (t === 'peloteo') this.engine.segPel = 300;
            this.persist();
        },

        toggleVisPeloteo() {
            this.engine.visPel = !this.engine.visPel;
            this.persist();
        },

        /* ============================================================
           RELOJ
           ============================================================ */
        startClock() {
            const update = () => {
                const now = new Date();
                const h = now.getHours().toString().padStart(2, '0');
                const m = now.getMinutes().toString().padStart(2, '0');
                const s = now.getSeconds().toString().padStart(2, '0');
                this.currentTime = `${h}:${m}:${s}`;
            };
            update();
            setInterval(update, 1000);
        },

        /* ============================================================
           UTILIDADES
           ============================================================ */
        formatTime(seconds) {
            const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
            const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
            const s = (seconds % 60).toString().padStart(2, '0');
            return `${h}:${m}:${s}`;
        },

        formatShortTime(seconds) {
            const m = Math.floor(seconds / 60).toString().padStart(2, '0');
            const s = (seconds % 60).toString().padStart(2, '0');
            return `${m}:${s}`;
        },

        /* ============================================================
           CLIMA
           ============================================================ */
        async loadWeather() {
            try {
                let lat = -34.6037;
                let lon = -58.3816;
                try {
                    const geoRes = await fetch('https://ipapi.co/json/');
                    const geo = await geoRes.json();
                    if (geo.latitude && geo.longitude) {
                        lat = geo.latitude;
                        lon = geo.longitude;
                    }
                } catch (e) { /* usamos por defecto */ }

                const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
                const res = await fetch(url);
                const data = await res.json();

                if (data.current_weather) {
                    this.temperature = Math.round(data.current_weather.temperature);
                    this.weatherLoaded = true;
                }
            } catch (e) {
                console.warn('No se pudo obtener el clima:', e);
            }
        },

        /* ============================================================
           PERSISTENCIA
           ============================================================ */
        persist() {
            const payload = {
                state: this.engine.getState(),
                names: this.names,
                updatedAt: Date.now(),
            };
            localStorage.setItem('padel_v1', JSON.stringify(payload));
            db.ref('marcador').set(payload);
        },

        bindFirebase() {
            const local = localStorage.getItem('padel_v1');
            if (local) {
                try {
                    const data = JSON.parse(local);
                    this.engine.restore(data.state);
                    this.names = data.names;
                } catch (e) { console.warn('Estado local corrupto', e); }
            }

            // Cargar torneo de localStorage mientras llega Firebase
            const localTorneo = localStorage.getItem('padel_torneo');
            if (localTorneo) {
                try {
                    const t = JSON.parse(localTorneo);
                    this.torneo = t.nombre || '';
                    this.categoria = t.categoria || '';
                } catch (e) { /* ignore */ }
            }

            // Cargar pantalla de localStorage mientras llega Firebase
            const localPantalla = localStorage.getItem('padel_pantalla');
            if (localPantalla) {
                try {
                    const p = JSON.parse(localPantalla);
                    this.pantallaOculta = !!p.oculta;
                    this.mensajePantalla = p.mensaje || '';
                } catch (e) { /* ignore */ }
            }

            db.ref('marcador').on('value', (snap) => {
                const data = snap.val();
                if (!data || this.syncing) return;
                if (this.isBoard) {
                    this.syncing = true;
                    this.engine.restore(data.state);
                    this.names = data.names;
                    this.syncing = false;
                }
            });

            // Listener del torneo
            db.ref('marcador/torneo').on('value', (snap) => {
                const data = snap.val();
                if (data) {
                    this.torneo = data.nombre || '';
                    this.categoria = data.categoria || '';
                }
            });

            // Listener de pantalla oculta
            db.ref('marcador/pantalla').on('value', (snap) => {
                const data = snap.val();
                if (data) {
                    this.pantallaOculta = !!data.oculta;
                    this.mensajePantalla = data.mensaje || '';
                }
            });
        },
    });
});

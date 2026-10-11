/**
 * PadelScoreEngine — Motor de reglas de pádel puro
 * v2.5 — Saque flexible + temporizadores + descansos + 3er set STB + historial de puntos
 */
class PadelScoreEngine {
    constructor(options = {}) {
        this.options = {
            sets: options.sets ?? 3,
            tieBreakAt: options.tieBreakAt ?? 6,
            goldenPoint: options.goldenPoint ?? false,
            superTieBreak: options.superTieBreak ?? 0,
            advantageMode: options.advantageMode ?? 'traditional',
        };
        this.reset();
    }

    /* ============================================================
       ESTADO
       ============================================================ */
    reset() {
        this.points = [0, 0];
        this.sets = [[0, 0, 0], [0, 0, 0]];
        this.currentSet = 0;
        this.mode = 'NORMAL';
        this.matchOver = false;
        this.winner = null;
        this.servingTeam = null;
        this.servingPlayer = null;

        this.serveOrder = { A: [0, 1], B: [2, 3] };
        this.nextServeIndex = { A: 0, B: 0 };
        this.firstServerTeam = null;

        this.segP = 0;
        this.segPel = 300;
        this.runP = false;
        this.runPel = false;
        this.visPel = true;

        this.segDescanso = 0;
        this.runDescanso = false;
        this.motivoDescanso = '';

        this.history = [];
        this.pointHistory = [];
        this.failedAdvantages = 0;
        this.message = 'EN JUEGO';
    }

    /* ============================================================
       SERIALIZACIÓN
       ============================================================ */
    getState() {
        return {
            points: [...this.points],
            sets: [[...this.sets[0]], [...this.sets[1]]],
            currentSet: this.currentSet,
            mode: this.mode,
            matchOver: this.matchOver,
            winner: this.winner,
            servingTeam: this.servingTeam,
            servingPlayer: this.servingPlayer,
            serveOrder: { A: [...this.serveOrder.A], B: [...this.serveOrder.B] },
            nextServeIndex: { ...this.nextServeIndex },
            firstServerTeam: this.firstServerTeam,
            failedAdvantages: this.failedAdvantages,
            message: this.message,
            options: { ...this.options },
            segP: this.segP,
            segPel: this.segPel,
            runP: this.runP,
            runPel: this.runPel,
            visPel: this.visPel,
            segDescanso: this.segDescanso,
            runDescanso: this.runDescanso,
            motivoDescanso: this.motivoDescanso,
            pointHistory: [...this.pointHistory],
        };
    }

    restore(state) {
        this.points = [...state.points];
        this.sets = [[...state.sets[0]], [...state.sets[1]]];
        this.currentSet = state.currentSet;
        this.mode = state.mode;
        this.matchOver = state.matchOver;
        this.winner = state.winner;
        this.servingTeam = state.servingTeam;
        this.servingPlayer = state.servingPlayer;
        this.serveOrder = {
            A: [...(state.serveOrder?.A ?? [0, 1])],
            B: [...(state.serveOrder?.B ?? [2, 3])]
        };
        this.nextServeIndex = state.nextServeIndex
            ? { ...state.nextServeIndex }
            : { A: 0, B: 0 };
        this.firstServerTeam = state.firstServerTeam ?? null;
        this.failedAdvantages = state.failedAdvantages ?? 0;
        this.message = state.message ?? 'EN JUEGO';
        if (state.options) this.options = { ...state.options };
        this.segP = state.segP ?? 0;
        this.segPel = state.segPel ?? 300;
        this.runP = state.runP ?? false;
        this.runPel = state.runPel ?? false;
        this.visPel = state.visPel ?? true;
        this.segDescanso = state.segDescanso ?? 0;
        this.runDescanso = state.runDescanso ?? false;
        this.motivoDescanso = state.motivoDescanso ?? '';
        this.pointHistory = state.pointHistory ? [...state.pointHistory] : [];
    }

    /* ============================================================
       API PÚBLICA
       ============================================================ */
    addPoint(team) {
        if (this.matchOver) return false;
        if (team !== 'A' && team !== 'B') return false;

        this.history.push(this.getState());
        if (this.history.length > 200) this.history.shift();

        const eq = team === 'A' ? 0 : 1;
        const ot = eq === 0 ? 1 : 0;

        // Capturar estado ANTES del punto (para el historial visual)
        const puntosAntes = this.getDisplayPoints();
        const setsAntes = [[...this.sets[0]], [...this.sets[1]]];
        const setActualAntes = this.currentSet;
        const modeAntes = this.mode;

        this.motivoDescanso = '';
        this.message = this.mode === 'TIE-BREAK' ? 'TIE-BREAK' : 'EN JUEGO';

        if (this.mode === 'NORMAL') {
            this._scoreNormal(eq, ot);
        } else {
            this._scoreTieBreak(eq);
        }

        // Guardar en historial de puntos
        this.pointHistory.unshift({
            team,
            pointsBefore: puntosAntes,
            setsBefore: setsAntes,
            setBefore: setActualAntes,
            modeBefore: modeAntes,
            timestamp: Date.now(),
        });
        if (this.pointHistory.length > 50) this.pointHistory.pop();

        return true;
    }

    undo() {
        if (this.history.length === 0) return false;
        this.restore(this.history.pop());
        return true;
    }

    setFirstServer(playerIndex) {
        if (playerIndex < 0 || playerIndex > 3) return;

        if (playerIndex === 0 || playerIndex === 1) {
            this.firstServerTeam = 'A';
            const teammate = playerIndex === 0 ? 1 : 0;
            this.serveOrder.A = [playerIndex, teammate];
            this.nextServeIndex.A = 0;
        } else {
            this.firstServerTeam = 'B';
            const teammate = playerIndex === 2 ? 3 : 2;
            this.serveOrder.B = [playerIndex, teammate];
            this.nextServeIndex.B = 0;
        }

        this.servingTeam = this.firstServerTeam;
        this.servingPlayer = this.firstServerTeam === 'A'
            ? this.serveOrder.A[0]
            : this.serveOrder.B[0];

        this.message = 'EN JUEGO';
    }

    setServer(playerIndex) {
        this.setFirstServer(playerIndex);
    }

    /* ============================================================
       DESCANSOS
       ============================================================ */
    _dispararDescanso(motivo, segundos) {
        this.motivoDescanso = motivo;
        this.segDescanso = segundos;
        this.runDescanso = segundos > 0;
        this.message = motivo;
    }

    aceptarDescanso() {
        this.runDescanso = false;
        this.segDescanso = 0;
        this.motivoDescanso = '';
        this.message = this.mode === 'TIE-BREAK' ? 'TIE-BREAK' : 'EN JUEGO';
    }

    /* ============================================================
       PUNTOS NORMALES
       ============================================================ */
    _scoreNormal(eq, ot) {
        const p = this.points;
        const gp = this.options.goldenPoint;

        if (p[eq] < 3) {
            p[eq]++;
        } else if (p[eq] === 3 && p[ot] < 3) {
            this._winGame(eq);
        } else if (p[eq] === 3 && p[ot] === 3) {
            if (gp) {
                this._winGame(eq);
            } else if (this.options.advantageMode === 'star') {
                this.failedAdvantages++;
                if (this.failedAdvantages >= 2) {
                    this.message = 'STAR POINT';
                    this._winGame(eq);
                } else {
                    p[eq] = 4;
                }
            } else {
                p[eq] = 4;
            }
        } else if (p[eq] === 3 && p[ot] === 4) {
            p[ot] = 3;
            this.failedAdvantages = 0;
        } else if (p[eq] === 4) {
            this._winGame(eq);
        }
    }

    /* ============================================================
       TIE-BREAK
       ============================================================ */
    _scoreTieBreak(eq) {
        this.points[eq]++;
        const total = this.points[0] + this.points[1];

        if (total % 6 === 0) this._dispararDescanso('CAMBIO DE LADO TB', 15);
        if (total % 2 !== 0) this._rotateServeTieBreak();

        const esSuperTB = this.currentSet === 2 && this.options.superTieBreak > 0;
        const target = esSuperTB ? this.options.superTieBreak : 7;

        if (this.points[eq] >= target && (this.points[eq] - this.points[eq === 0 ? 1 : 0]) >= 2) {
            this.sets[eq][this.currentSet] = 7;
            this.sets[eq === 0 ? 1 : 0][this.currentSet] = 6;
            this._checkMatch();
        }
    }

    /* ============================================================
       GANAR JUEGO / SET
       ============================================================ */
    _winGame(eq) {
        this.points = [0, 0];
        this.failedAdvantages = 0;
        this.sets[eq][this.currentSet]++;

        const gA = this.sets[0][this.currentSet];
        const gB = this.sets[1][this.currentSet];
        const total = gA + gB;

        if ((gA >= 6 || gB >= 6) && Math.abs(gA - gB) >= 2) {
            this._checkMatch();
        } else if (gA === this.options.tieBreakAt && gB === this.options.tieBreakAt) {
            this.mode = 'TIE-BREAK';
            this._rotateServe();
            this.message = 'TIE-BREAK';
        } else {
            if (total % 2 !== 0) {
                if (total === 1) {
                    this._dispararDescanso('CAMBIO SIN DESCANSO', 10);
                } else {
                    this._dispararDescanso('CAMBIO DE LADO', 90);
                }
            }
            this._rotateServe();
        }
    }

    _checkMatch() {
        let sA = 0, sB = 0;
        for (let i = 0; i < 3; i++) {
            const vA = this.sets[0][i], vB = this.sets[1][i];
            if ((vA >= 6 || vB >= 6) && Math.abs(vA - vB) >= 2) { vA > vB ? sA++ : sB++; }
            else if (vA === 7 && vB === 6) sA++;
            else if (vB === 7 && vA === 6) sB++;
        }
        const needed = Math.ceil(this.options.sets / 2);
        if (sA === needed || sB === needed) {
            this.matchOver = true;
            this.winner = sA > sB ? 'A' : 'B';
            this.message = 'PARTIDO FINALIZADO';
            this.runP = false;
            this.runDescanso = false;
            this.segDescanso = 0;
        } else {
            this._dispararDescanso('SET FINALIZADO', 120);
            if (this.currentSet < 2) {
                this.currentSet++;
                this.mode = (this.currentSet === 2 && this.options.superTieBreak > 0)
                    ? 'TIE-BREAK' : 'NORMAL';
                this.points = [0, 0];

                this.serveOrder = { A: [0, 1], B: [2, 3] };
                this.nextServeIndex = { A: 0, B: 0 };
                this.servingTeam = null;
                this.servingPlayer = null;
                this.firstServerTeam = null;
            }
        }
    }

    /* ============================================================
       ROTACIÓN DE SAQUE
       ============================================================ */
    _rotateServe() {
        if (this.servingPlayer === null) return;

        const nextTeam = this.servingTeam === 'A' ? 'B' : 'A';

        this.nextServeIndex[this.servingTeam] =
            (this.nextServeIndex[this.servingTeam] + 1) % 2;

        this.servingTeam = nextTeam;
        this.servingPlayer = this.serveOrder[nextTeam][this.nextServeIndex[nextTeam]];
    }

    _rotateServeTieBreak() {
        if (this.servingPlayer === null) return;

        const nextTeam = this.servingTeam === 'A' ? 'B' : 'A';

        if (nextTeam === 'A' && this.servingTeam === 'B') {
            this.nextServeIndex.A = (this.nextServeIndex.A + 1) % 2;
        } else if (nextTeam === 'B' && this.servingTeam === 'A') {
            this.nextServeIndex.B = (this.nextServeIndex.B + 1) % 2;
        }

        this.servingTeam = nextTeam;
        this.servingPlayer = this.serveOrder[nextTeam][this.nextServeIndex[nextTeam]];
    }

    /* ============================================================
       PRESENTACIÓN
       ============================================================ */
    getDisplayPoints() {
        if (this.mode === 'TIE-BREAK') {
            return { A: String(this.points[0]), B: String(this.points[1]) };
        }
        const labels = ['0', '15', '30', '40', 'Ad'];
        return { A: labels[this.points[0]], B: labels[this.points[1]] };
    }

    isGoldenPointActive() {
        return this.options.goldenPoint && this.points[0] === 3 && this.points[1] === 3;
    }
}
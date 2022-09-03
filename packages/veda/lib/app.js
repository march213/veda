"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const view_1 = __importDefault(require("./view"));
const validator_1 = require("./validator");
const player_1 = __importDefault(require("./player"));
const player_server_1 = __importDefault(require("./player-server"));
const constants_1 = require("./constants");
const osc_loader_1 = __importDefault(require("./osc-loader"));
const recorder_1 = __importDefault(require("./recorder"));
const glslify = __importStar(require("glslify-lite"));
const prebuilt = __importStar(require("glslang-validator-prebuilt"));
class App {
    constructor(config) {
        this.view = null;
        this.glslangValidatorPath = prebuilt.path;
        this.lastShader = constants_1.INITIAL_SHADER;
        this.lastSoundShader = constants_1.INITIAL_SOUND_SHADER;
        this.osc = null;
        this.recorder = new recorder_1.default();
        this.onAnyChanges = ({ added }) => {
            if (added.glslangValidatorPath) {
                this.glslangValidatorPath = added.glslangValidatorPath;
            }
            if (added.server !== undefined) {
                if (this.player) {
                    this.player.command({ type: 'STOP' });
                }
                const rc = this.config.createRc();
                if (added.server) {
                    if (this.view !== null) {
                        this.view.destroy();
                    }
                    this.player = new player_server_1.default(added.server, {
                        rc,
                        isPlaying: this.state.isPlaying,
                        projectPath: this.config.projectPath,
                        lastShader: this.lastShader,
                    });
                }
                else {
                    this.view = new view_1.default(atom.workspace.element);
                    this.player = new player_1.default(this.view, rc, this.state.isPlaying, this.lastShader);
                }
            }
            if (added.osc !== undefined) {
                const port = added.osc;
                const osc = this.osc;
                if (osc && (!port || osc.port !== parseInt(port.toString(), 10))) {
                    osc.destroy();
                    this.osc = null;
                }
                if (port && !this.osc) {
                    const oscLoader = new osc_loader_1.default(port);
                    this.osc = oscLoader;
                    oscLoader.on('message', this.onOsc);
                    oscLoader.on('reload', () => this.loadLastShader());
                }
            }
        };
        this.onChange = (rcDiff) => {
            this.onAnyChanges(rcDiff);
            this.player.onChange(rcDiff);
            this.loadLastShader();
            this.loadLastSoundShader();
        };
        this.onOsc = (data) => {
            this.player.command({ type: 'SET_OSC', data });
        };
        const rc = config.rc;
        this.view = new view_1.default(atom.workspace.getElement());
        this.player = new player_1.default(this.view, rc, false, this.lastShader);
        this.config = config;
        this.config.on('change', this.onChange);
        this.state = {
            isPlaying: false,
        };
    }
    destroy() {
        this.player.destroy();
        if (this.osc) {
            this.osc.destroy();
        }
    }
    toggle() {
        return this.state.isPlaying ? this.stop() : this.play();
    }
    play() {
        this.state.isPlaying = true;
        this.player.command({ type: 'PLAY' });
        this.config.play();
    }
    stop() {
        this.state.isPlaying = false;
        this.player.command({ type: 'STOP' });
        this.player.command({ type: 'STOP_SOUND' });
        this.config.stop();
        this.stopWatching();
        this.stopRecording();
    }
    watchActiveShader() {
        if (this.state.activeEditorDisposer) {
            return;
        }
        this.watchShader();
        this.state.activeEditorDisposer =
            atom.workspace.onDidChangeActiveTextEditor(() => {
                this.watchShader();
            });
    }
    watchShader() {
        if (this.state.editorDisposer) {
            this.state.editorDisposer.dispose();
            this.state.editorDisposer = undefined;
        }
        const editor = atom.workspace.getActiveTextEditor();
        this.state.editor = editor;
        this.loadShaderOfEditor(editor);
        if (editor !== undefined) {
            this.state.editorDisposer = editor.onDidStopChanging(() => {
                this.loadShaderOfEditor(editor);
            });
        }
    }
    loadShader() {
        const editor = atom.workspace.getActiveTextEditor();
        this.loadShaderOfEditor(editor);
    }
    loadSoundShader() {
        const editor = atom.workspace.getActiveTextEditor();
        return this.loadShaderOfEditor(editor, true);
    }
    playSound() {
        this.loadSoundShader().then(() => this.player.command({ type: 'PLAY_SOUND' }));
    }
    stopSound() {
        this.player.command({ type: 'STOP_SOUND' });
    }
    loadLastShader() {
        if (!this.lastShader) {
            return;
        }
        this.player.command({ type: 'LOAD_SHADER', shader: this.lastShader });
    }
    loadLastSoundShader() {
        if (!this.lastSoundShader) {
            return;
        }
        this.player.command({
            type: 'LOAD_SOUND_SHADER',
            shader: this.lastSoundShader,
        });
    }
    stopWatching() {
        this.state.editor = undefined;
        if (this.state.activeEditorDisposer) {
            this.state.activeEditorDisposer.dispose();
            this.state.activeEditorDisposer = undefined;
        }
        if (this.state.editorDisposer) {
            this.state.editorDisposer.dispose();
            this.state.editorDisposer = undefined;
        }
    }
    createPasses(rcPasses, openedShader, openedFilepath, extension, dirname, useGlslify, isGLSL3) {
        if (rcPasses.length === 0) {
            rcPasses.push({});
        }
        const finalPass = rcPasses.length - 1;
        return Promise.all(rcPasses.map((rcPass, i) => __awaiter(this, void 0, void 0, function* () {
            const pass = {
                MODEL: rcPass.MODEL,
                TARGET: rcPass.TARGET,
                FLOAT: rcPass.FLOAT,
                WIDTH: rcPass.WIDTH,
                HEIGHT: rcPass.HEIGHT,
                BLEND: rcPass.BLEND,
                GLSL3: isGLSL3,
            };
            if (!rcPass.fs && !rcPass.vs) {
                if (extension === '.vert' || extension === '.vs') {
                    pass.vs = openedShader;
                }
                else {
                    pass.fs = openedShader;
                }
            }
            else {
                if (rcPass.vs) {
                    const filepath = path_1.default.resolve(dirname, rcPass.vs);
                    if (filepath === openedFilepath) {
                        pass.vs = openedShader;
                    }
                    else {
                        pass.vs = yield (0, validator_1.loadFile)(this.glslangValidatorPath, filepath, useGlslify);
                    }
                    if (i === finalPass &&
                        (extension === '.frag' || extension === '.fs')) {
                        pass.fs = openedShader;
                    }
                }
                if (rcPass.fs) {
                    const filepath = path_1.default.resolve(dirname, rcPass.fs);
                    if (filepath === openedFilepath) {
                        pass.fs = openedShader;
                    }
                    else {
                        pass.fs = yield (0, validator_1.loadFile)(this.glslangValidatorPath, filepath, useGlslify);
                    }
                    if (i === finalPass &&
                        (extension === '.vert' || extension === '.vs')) {
                        pass.vs = openedShader;
                    }
                }
            }
            return pass;
        })));
    }
    loadShaderOfEditor(editor, isSound) {
        return __awaiter(this, void 0, void 0, function* () {
            if (editor === undefined) {
                return;
            }
            const filepath = editor.getPath();
            if (filepath === undefined) {
                return;
            }
            const dirname = path_1.default.dirname(filepath);
            const m = (filepath || '').match(/(\.(?:glsl|frag|vert|fs|vs))$/);
            if (!m) {
                console.error("The filename for current doesn't seems to be GLSL.");
                return Promise.resolve();
            }
            const extension = m[1];
            let shader = editor.getText();
            try {
                let headComment = (shader.match(/(?:\/\*)((?:.|\n|\r|\n\r)*?)(?:\*\/)/) || [])[1];
                headComment = headComment || '{}';
                let diff;
                if (isSound) {
                    diff = this.config.setSoundSettingsByString(filepath, headComment);
                }
                else {
                    diff = this.config.setFileSettingsByString(filepath, headComment);
                }
                const rc = diff.newConfig;
                this.onAnyChanges(diff);
                this.player.onChange(diff);
                if (rc.glslify) {
                    shader = yield glslify.compile(shader, {
                        basedir: path_1.default.dirname(filepath),
                    });
                }
                if (!isSound) {
                    yield (0, validator_1.validator)(this.glslangValidatorPath, shader, extension);
                }
                const matcharray = shader.split('\n')[0].match(/(#version 300 es)/) || [];
                const isGLSL3 = !!matcharray[0];
                const passes = yield this.createPasses(rc.PASSES, shader, filepath, extension, dirname, rc.glslify, isGLSL3);
                if (isSound) {
                    this.lastSoundShader = shader;
                    return this.player.command({
                        type: 'LOAD_SOUND_SHADER',
                        shader,
                    });
                }
                else {
                    this.lastShader = passes;
                    return this.player.command({
                        type: 'LOAD_SHADER',
                        shader: passes,
                    });
                }
            }
            catch (e) {
                console.error(e);
            }
        });
    }
    toggleFullscreen() {
        this.player.command({ type: 'TOGGLE_FULLSCREEN' });
    }
    startRecording() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.view === null) {
                return;
            }
            const canvas = this.view.getCanvas();
            const fps = 60 / this.config.rc.frameskip;
            const width = canvas.offsetWidth;
            const height = canvas.offsetHeight;
            const dst = this.config.projectPath;
            this.player.command({ type: 'START_RECORDING' });
            this.recorder.start(canvas, fps, width, height, dst);
        });
    }
    stopRecording() {
        return __awaiter(this, void 0, void 0, function* () {
            this.recorder.stop();
            this.player.command({ type: 'STOP_RECORDING' });
        });
    }
    setRecordingMode(mode) {
        this.recorder.setRecordingMode(mode);
    }
    insertTime() {
        this.player.query({ type: 'TIME' }).then((time) => {
            const editor = atom.workspace.getActiveTextEditor();
            if (editor) {
                editor.insertText(time.toString());
            }
        }, (err) => {
            console.error(err);
            atom.notifications.addError('[VEDA] Failed to get time.');
        });
    }
}
exports.default = App;
//# sourceMappingURL=app.js.map
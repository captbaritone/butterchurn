import _ from 'lodash';
import Utils from '../utils';

export default class PresetEquationRunner {
  constructor (preset, globalVars, opts) {
    this.preset = preset;

    this.texsizeX = opts.texsizeX;
    this.texsizeY = opts.texsizeY;
    this.mesh_width = opts.mesh_width;
    this.mesh_height = opts.mesh_height;
    this.aspectx = opts.aspectx;
    this.aspecty = opts.aspecty;
    this.invAspectx = 1.0 / this.aspectx;
    this.invAspecty = 1.0 / this.aspecty;

    this.qs = _.map(_.range(1, 33), (x) => `q${x}`);
    this.ts = _.map(_.range(1, 9), (x) => `t${x}`);
    this.regs = _.map(_.range(0, 100), (x) => {
      if (x < 10) {
        return `reg0${x}`;
      }
      return `reg${x}`;
    });

    this.initializeEquations(globalVars);
  }

  initializeEquations (globalVars) {
    this.runVertEQs = (this.preset.pixel_eqs !== '');

    this.mdVSQInit = null;
    this.mdVSRegs = null;
    this.mdVSFrame = null;
    this.mdVSUserKeys = null;
    this.mdVSFrameMap = null;

    this.mdVSShapes = null;
    this.mdVSUserKeysShapes = null;
    this.mdVSFrameMapShapes = null;

    this.mdVSWaves = null;
    this.mdVSUserKeysWaves = null;
    this.mdVSFrameMapWaves = null;

    this.mdVSQAfterFrame = null;

    this.gmegabuf = new Array(1048576).fill(0);

    const mdVSBase = {
      frame: globalVars.frame,
      time: globalVars.time,
      fps: globalVars.fps,
      bass: globalVars.bass,
      bass_att: globalVars.bass_att,
      mid: globalVars.mid,
      mid_att: globalVars.mid_att,
      treb: globalVars.treb,
      treb_att: globalVars.treb_att,
      meshx: this.mesh_width,
      meshy: this.mesh_height,
      aspectx: this.invAspectx,
      aspecty: this.invAspecty,
      pixelsx: this.texsizeX,
      pixelsy: this.texsizeY,
      gmegabuf: this.gmegabuf,
    };

    this.mdVS = Object.assign({}, this.preset.baseVals, mdVSBase);

    this.mdVS.megabuf = new Array(1048576).fill(0);
    this.mdVS.rand_start = new Float32Array([
      Math.random(), Math.random(), Math.random(), Math.random()
    ]);
    this.mdVS.rand_preset = new Float32Array([
      Math.random(), Math.random(), Math.random(), Math.random()
    ]);

    const nonUserKeys = _.concat(this.qs, this.regs, _.keys(this.mdVS));

    const mdVSAfterInit = this.preset.init_eqs(Utils.cloneVars(this.mdVS));

    // qs need to be initialized to there init values every frame
    this.mdVSQInit = _.pick(mdVSAfterInit, this.qs);
    this.mdVSRegs = _.pick(mdVSAfterInit, this.regs);
    const initUserVars = _.pick(mdVSAfterInit, _.keys(_.omit(mdVSAfterInit, nonUserKeys)));
    initUserVars.megabuf = mdVSAfterInit.megabuf;
    initUserVars.gmegabuf = mdVSAfterInit.gmegabuf;

    this.mdVSFrame = this.preset.frame_eqs(Object.assign({},
                                                         this.mdVS,
                                                         this.mdVSQInit,
                                                         this.mdVSRegs,
                                                         initUserVars));

    // user vars need to be copied between frames
    this.mdVSUserKeys = _.keys(_.omit(this.mdVSFrame, nonUserKeys));

    // Determine vars to carry over between frames
    this.mdVSFrameMap = _.pick(this.mdVSFrame, this.mdVSUserKeys);

    // qs for shapes
    this.mdVSQAfterFrame = _.pick(this.mdVSFrame, this.qs);
    this.mdVSRegs = _.pick(this.mdVSFrame, this.regs);

    this.mdVSWaves = [];
    this.mdVSTWaveInits = [];
    this.mdVSUserKeysWaves = [];
    this.mdVSFrameMapWaves = [];
    if (this.preset.waves && this.preset.waves.length > 0) {
      for (let i = 0; i < this.preset.waves.length; i++) {
        const wave = this.preset.waves[i];
        const baseVals = wave.baseVals;
        if (_.get(baseVals, 'enabled', 0) !== 0) {
          let mdVSWave = Object.assign({}, baseVals, mdVSBase);

          const nonUserWaveKeys = _.concat(this.qs, this.ts, this.regs, _.keys(mdVSWave));

          Object.assign(mdVSWave, this.mdVSQAfterFrame, this.mdVSRegs);
          mdVSWave.megabuf = new Array(1048576).fill(0);

          if (wave.init_eqs) {
            mdVSWave = wave.init_eqs(mdVSWave);

            this.mdVSRegs = _.pick(mdVSWave, this.regs);

            // base vals need to be reset
            Object.assign(mdVSWave, baseVals);
          }
          this.mdVSWaves.push(mdVSWave);
          this.mdVSTWaveInits.push(_.pick(mdVSWave, this.ts));

          this.mdVSUserKeysWaves.push(_.keys(_.omit(mdVSWave, nonUserWaveKeys)));
          this.mdVSFrameMapWaves.push(_.pick(mdVSWave, this.mdVSUserKeysWaves[i]));
        } else {
          this.mdVSWaves.push({});
          this.mdVSTWaveInits.push({});

          this.mdVSUserKeysWaves.push([]);
          this.mdVSFrameMapWaves.push({});
        }
      }
    }

    this.mdVSShapes = [];
    this.mdVSTShapeInits = [];
    this.mdVSUserKeysShapes = [];
    this.mdVSFrameMapShapes = [];
    if (this.preset.shapes && this.preset.shapes.length > 0) {
      for (let i = 0; i < this.preset.shapes.length; i++) {
        const shape = this.preset.shapes[i];
        const baseVals = shape.baseVals;
        if (_.get(baseVals, 'enabled', 0) !== 0) {
          let mdVSShape = Object.assign({}, baseVals, mdVSBase);

          const nonUserShapeKeys = _.uniq(_.concat(this.qs, this.ts, this.regs, _.keys(mdVSShape)));

          Object.assign(mdVSShape, this.mdVSQAfterFrame, this.mdVSRegs);
          mdVSShape.megabuf = new Array(1048576).fill(0);

          if (shape.init_eqs) {
            mdVSShape = shape.init_eqs(mdVSShape);

            this.mdVSRegs = _.pick(mdVSShape, this.regs);

            // base vals need to be reset
            Object.assign(mdVSShape, baseVals);
          }
          this.mdVSShapes.push(mdVSShape);
          this.mdVSTShapeInits.push(_.pick(mdVSShape, this.ts));

          this.mdVSUserKeysShapes.push(_.keys(_.omit(mdVSShape, nonUserShapeKeys)));
          this.mdVSFrameMapShapes.push(_.pick(mdVSShape, this.mdVSUserKeysShapes[i]));
        } else {
          this.mdVSShapes.push({});
          this.mdVSTShapeInits.push({});

          this.mdVSUserKeysShapes.push([]);
          this.mdVSFrameMapShapes.push({});
        }
      }
    }
  }

  updatePreset (preset, globalVars) {
    this.preset = preset;
    this.initializeEquations(globalVars);
  }

  updateGlobals (opts) {
    this.texsizeX = opts.texsizeX;
    this.texsizeY = opts.texsizeY;
    this.mesh_width = opts.mesh_width;
    this.mesh_height = opts.mesh_height;
    this.aspectx = opts.aspectx;
    this.aspecty = opts.aspecty;
    this.invAspectx = 1.0 / this.aspectx;
    this.invAspecty = 1.0 / this.aspecty;
  }

  runFrameEquations (globalVars) {
    this.mdVSFrame = Object.assign({}, this.mdVS, this.mdVSQInit, this.mdVSFrameMap, globalVars);

    this.mdVSFrame = this.preset.frame_eqs(this.mdVSFrame);

    this.mdVSFrameMap = _.pick(this.mdVSFrame, this.mdVSUserKeys);
    this.mdVSQAfterFrame = _.pick(this.mdVSFrame, this.qs);
  }
}

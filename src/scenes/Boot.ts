import { SCENES } from '../config';
import { loadLogo } from '../ui/fx/logoReveal';
import { BaseScene } from './BaseScene';

export class Boot extends BaseScene {
  constructor() {
    super(SCENES.boot);
  }

  preload(): void {
    this.load.setPath('assets/');
    loadLogo(this.load);
  }

  create(): void {
    this.scene.start(SCENES.preload);
  }
}

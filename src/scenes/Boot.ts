import { SCENES } from '../config';
import { BaseScene } from './BaseScene';

export class Boot extends BaseScene {
  constructor() {
    super(SCENES.boot);
  }

  preload(): void {
    this.load.setPath('assets/');
    this.load.image('logo', 'images/ui/logo.png');
  }

  create(): void {
    this.scene.start(SCENES.preload);
  }
}

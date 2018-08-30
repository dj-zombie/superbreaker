(function () {
  'use strict';

  function Boot() {}

  Boot.prototype = {
		rotatedevice: {},

		preload: function () {
			this.load.image('preloader', 'assets/preloader4.gif');
			this.load.image('menu-background', 'assets/menu/menu-background.png');
			this.load.audio('ui-music', 'assets/audio/ui/music-beat.mp3');
    },

    create: function () {
      // configure game
			this.input.maxPointers = 1;
      this.stage.disableVisibilityChange = true;
			this.game.physics.startSystem(Phaser.Physics.ARCADE);

			if (this.game.device.desktop) {
				// console.log('Desktop detected');
				this.scale.scaleMode = Phaser.ScaleManager.RESIZE;
				// this.scale.scaleMode = Phaser.ScaleManager.EXACT_FIT;
        this.scale.pageAlignHorizontally = true;
        this.scale.pageAlignVertically = true;
		    this.scale.forceOrientation(false, true);
				this.scale.maxHeight = 800;
				// this.scale.aspectRatio = 1.3;
      }
      else {
				// console.log('Mobile Detected');
				// this.scale.scaleMode = Phaser.ScaleManager.SHOW_ALL;
				this.scale.scaleMode = Phaser.ScaleManager.RESIZE;
				// this.scale.scaleMode = Phaser.ScaleManager.EXACT_FIT;
				this.scale.fullScreenScaleMode = Phaser.ScaleManager.EXACT_FIT;
        this.scale.forceOrientation(false, true,'orientation'); //landscape, portrait, incorrectorientation image
        this.scale.enterIncorrectOrientation.add(this.enterIncorrectOrientation, this);
        this.scale.leaveIncorrectOrientation.add(this.leaveIncorrectOrientation, this);
				// this.scale.minHeight = 800;
				// this.scale.maxHeight = 800;
				this.game.scale.pageAlignVertically = true;
				// this.game.scale.setScreenSize();
				//
				this.game.scale.refresh();
      }
      this.state.start('preloader');
    },

		// display message to rotate device when incorrect
		enterIncorrectOrientation: function () {
      this.oriented = false;
			this.paused = true;
			this.rotatedevice = this.add.image(this.game.world.centerX, this.game.world.centerY, 'rotatedevice');
			this.rotatedevice.anchor.set(0.5);
			var scaleWidth = this.game.scale.bounds.width / 600;
			var scaleHeight = this.game.scale.bounds.height / 800;
			this.rotatedevice.scale.setTo(scaleWidth, scaleHeight);
			this.rotatedevice.alpha = 0.95;
    },

		// remove message and unpause game
    leaveIncorrectOrientation: function () {
			this.rotatedevice.destroy();
			this.paused = false;
      this.oriented = true;
    }
  };

  window['yophaser'] = window['yophaser'] || {};
  window['yophaser'].Boot = Boot;
}());

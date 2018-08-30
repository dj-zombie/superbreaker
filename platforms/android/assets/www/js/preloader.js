var fx;
(function() {
  'use strict';

  function Preloader() {
    this.asset = null;
    this.ready = false;
  }

  Preloader.prototype = {
    preload: function () {
			var scaleWidth = this.game.scale.bounds.width / 600;
			var scaleHeight = this.game.scale.bounds.height / 800;

			// Background
			var bg = this.game.add.sprite(this.game.world.centerX, this.game.world.centerY, 'menu-background');
			bg.anchor.set(0.5);
			bg.scale.set(scaleWidth, scaleHeight);

      this.asset = this.add.sprite(this.game.width * 0.5 - 110, this.game.height * 0.5 - 10, 'preloader');
      this.load.setPreloadSprite(this.asset);
      this.load.onLoadComplete.addOnce(this.onLoadComplete, this);
      this.loadResources();
      this.ready = true;


    },

    loadResources: function () {
			// this.load.video('chrome', 'assets/video/fullsize.mp4');
			this.load.image('ball', 'assets/ball2.png');
			this.load.image('bat', 'assets/bats/bat.png');
      this.load.image('rotatedevice', 'assets/rotatedevice.gif');
			this.load.image('brick', 'assets/bricks/brick_purple2.png');
			// this.load.image('brick_green_small', 'assets/bricks/brick_purple2.png');
			// this.load.image('brick_blue_small', 'assets/bricks/brick_blue_small.png');

			var numLevels = 20;
			for (var i=1; i < numLevels + 1; i++) {
				this.load.tilemap('level' + i, 'assets/levels/level' + i + '.json', null, Phaser.Tilemap.TILED_JSON);
			}

			// Powerups
			this.load.image('magnet', 'assets/powerups/magnet.png');
			this.load.image('bigger', 'assets/powerups/bigger.png');
			this.load.image('smaller', 'assets/powerups/smaller.png');
			this.load.image('laser-powerup', 'assets/powerups/laser.png');
			this.load.image('balls', 'assets/powerups/balls.png');
			this.load.image('fireball', 'assets/powerups/fireball.png');
			this.load.image('fire1', 'assets/powerups/fire-1.png');
			this.load.image('fire2', 'assets/powerups/fire-2.png');
			this.load.image('fire3', 'assets/powerups/fire-3.png');
			this.load.image('fire4', 'assets/powerups/fire-4.png');
			this.load.image('smoke', 'assets/powerups/smoke.png');


			this.load.image('brickblue', 'assets/bricks/brick_blue.png');
			this.load.image('brickblue2', 'assets/bricks/brick_blue2.png');
			this.load.image('brickgreen', 'assets/bricks/brick_green.png');
			this.load.image('brickgreen2', 'assets/bricks/brick_green2.png');
			this.load.image('brickred', 'assets/bricks/brick_red.png');
			this.load.image('brickred2', 'assets/bricks/brick_red2.png');
			this.load.image('brickorange', 'assets/bricks/brick_orange.png');
			this.load.image('brickorange2', 'assets/bricks/brick_orange2.png');
			this.load.image('brickpink', 'assets/bricks/brick_pink.png');
			this.load.image('brickpurple2', 'assets/bricks/brick_purple2.png');
			this.load.image('brickteal', 'assets/bricks/brick_teal.png');
			this.load.image('brickteal2', 'assets/bricks/brick_teal2.png');
			this.load.image('brickwhite', 'assets/bricks/brick_white.png');
			this.load.image('brickwhite2', 'assets/bricks/brick_white2.png');
			this.load.image('brickyellow', 'assets/bricks/brick_yellow.png');
			this.load.image('brickyellow2', 'assets/bricks/brick_yellow2.png');

			this.load.image('brickblue-piece', 'assets/bricks/brick_blue_piece.png');
			// this.load.image('background', 'assets/background/background.jpg');
			this.load.image('background1', 'assets/background/background1.jpg');
			this.load.image('background2', 'assets/background/background2.jpg');
			this.load.image('background3', 'assets/background/background3.png')
			this.load.image('background4', 'assets/background/background4.png')
			this.load.image('background5', 'assets/background/background5.png');
			this.load.image('heart', 'assets/heart.png');
			this.load.image('arrow', 'assets/arrow.png');
			this.load.image('laser', 'assets/laser.png');
			this.load.image('trail', 'assets/bricks/brick_white_piece.png');

			// Menu
      this.load.image('menu-instructions', 'assets/menu/menu-instructions.png');
      this.load.image('menu-credits', 'assets/menu/menu-credits.png');
			this.load.image('locked-dialog', 'assets/menu/locked-dialog.png');
			this.load.image('rich-dialog', 'assets/menu/rich-dialog.png');
			this.load.image('ads-dialog', 'assets/menu/ads-dialog.png');
			this.load.image('complete-dialog', 'assets/menu/complete-dialog.png');
			this.load.image('coins-dialog', 'assets/menu/coins-dialog.png');
			this.load.image('menu-logo', 'assets/menu/logo.png');
			this.load.image('menu-newgame', 'assets/menu/new-game.png');
			this.load.image('menu-easy', 'assets/menu/easy.png');
			this.load.image('menu-medium', 'assets/menu/medium.png');
			this.load.image('menu-hard', 'assets/menu/hard.png');
			// this.load.image('menu-settings', 'assets/menu/settings.png');
			this.load.image('menu-exit', 'assets/menu/exit.png');
			this.load.image('menu-levelselect', 'assets/menu/level-select.png');
			this.load.image('menu-button', 'assets/menu/button.png');
			this.load.image('menu-star', 'assets/menu/star.png');
			this.load.image('menu-starbw', 'assets/menu/star-bw.png');
			this.load.image('menu-back', 'assets/menu/back.png');
			this.load.image('menu-win', 'assets/menu/win-background.png');
			this.load.image('menu-button', 'assets/menu/menu-button.png');
			this.load.image('pause-button', 'assets/menu/pause-button.png');
			this.load.image('play-button', 'assets/menu/play-button.png');
			this.load.image('replay-button', 'assets/menu/replay-button.png');
			this.load.image('upgrades-button', 'assets/menu/upgrades.png');
			this.load.image('star-big', 'assets/menu/star-big.png');

			// Spritesheets
			// this.load.spritesheet('buttonhorizontal', 'assets/gamepad.png',96,64);
			// this.load.spritesheet('buttonleft', 'assets/gamepad-left.png',96,64);
			// this.load.spritesheet('buttonright', 'assets/gamepad-right.png',96,64);
			// this.load.spritesheet('tileset', 'assets/tileset.png');
			this.load.spritesheet('coin', 'assets/powerups/coins.png', 25, 25);
			// this.load.spritesheet('red-fireball', 'assets/powerups/red-fireball.png', 512, 197, 6);

			// Audio
			this.load.audio('c0', 'assets/audio/c0.mp3');
			this.load.audio('c1', 'assets/audio/c1.mp3');
			this.load.audio('c2', 'assets/audio/c2.mp3');
			this.load.audio('c3', 'assets/audio/c3.mp3');
			this.load.audio('f0', 'assets/audio/f0.mp3');
			this.load.audio('f1', 'assets/audio/f1.mp3');
			this.load.audio('f2', 'assets/audio/f2.mp3');
			this.load.audio('f3', 'assets/audio/f3.mp3');
			this.load.audio('g0', 'assets/audio/g0.mp3');
			this.load.audio('g1', 'assets/audio/g1.mp3');
			this.load.audio('g2', 'assets/audio/g2.mp3');
			this.load.audio('g3', 'assets/audio/g3.mp3');
			this.load.audio('d0', 'assets/audio/d0.mp3');
			this.load.audio('d1', 'assets/audio/d1.mp3');
			this.load.audio('d2', 'assets/audio/d2.mp3');
			this.load.audio('d3', 'assets/audio/d3.mp3');
			this.load.audio('ui-move', 'assets/audio/ui/move.mp3');
			this.load.audio('ui-on', 'assets/audio/ui/on.mp3');
			this.load.audio('ui-off', 'assets/audio/ui/off.mp3');
			this.load.audio('ui-select', 'assets/audio/ui/select.mp3');
			this.load.audio('ui-toggle', 'assets/audio/ui/toggle.mp3');
			this.load.audio('win-jingle', 'assets/audio/ui/win-jingle.mp3');
			// this.load.audio('breakBrick', 'assets/audio/boing.wav');
			// this.load.audio('bounceBat', 'assets/audio/boing.wav');
			// this.load.audio('bounceWall', 'assets/audio/wall.wav');
			this.load.audio('win', 'assets/audio/win.wav');
			this.load.audio('death', 'assets/audio/death.mp3');
			this.load.audio('gameover', 'assets/audio/gameover.wav');
			this.load.audio('music', 'assets/audio/song0.mp3');
			this.load.audio('laser', 'assets/audio/laser.mp3');
			this.load.audio('break0', 'assets/audio/breaks/break0.mp3');
			this.load.audio('break1', 'assets/audio/breaks/break1.mp3');
			this.load.audio('break2', 'assets/audio/breaks/break2.mp3');
			this.load.audio('break3', 'assets/audio/breaks/break3.mp3');
			this.load.audio('break4', 'assets/audio/breaks/break4.mp3');
			this.load.audio('break5', 'assets/audio/breaks/break5.mp3');
			this.load.audio('coin', 'assets/audio/powerups/coin.mp3');
			this.load.audio('bigger', 'assets/audio/powerups/bigger.mp3');
			this.load.audio('smaller', 'assets/audio/powerups/smaller.mp3');
			this.load.audio('laser-pickup', 'assets/audio/powerups/laser.mp3');
			this.load.audio('balls', 'assets/audio/powerups/balls.mp3');
			this.load.audio('magnet-pickup', 'assets/audio/powerups/magnet2.mp3');
			this.load.audio('fireball-pickup', 'assets/audio/powerups/fireball.mp3');

			// Fonts
			this.load.bitmapFont('digi', 'assets/fonts/carrier_command.png', 'assets/fonts/carrier_command.xml');
    },

    create: function () {
    },

    update: function () {
      if (!!this.ready) {
        this.game.state.start('menu');
        // this.game.state.start('game');
      }
    },

    onLoadComplete: function () {
      this.ready = true;
    }
  };

  window['yophaser'] = window['yophaser'] || {};
  window['yophaser'].Preloader = Preloader;
}());

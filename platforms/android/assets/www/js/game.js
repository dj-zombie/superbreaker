var info;
var DIFFICULTY_EASY = 'easy';
var DIFFICULTY_NORM = 'normal';
var DIFFICULTY_HARD = 'hard';
var VEL_MAX = 500;
var VEL_INCREASE = 20;
var VEL_MIN = 275;

(function() {
  'use strict';

  function Game() {}

  Game.prototype = {
    oriented: false,
		autoPlay: false,
		debugMode: false,
		isGameOver: false,
		animateScore: false,
    stopShake: false,
		scoreCounter: 0,

		manager: {},
		emitter: {},
		trailEmitter: {},
		graveyard: [],

		// Tilemap
		map: {},
		backgroundLayer: {},
		objectLayer: {},
		tileLayer: {},

		arrowRotateLeft: false,
		arrowrotateRight: true,
		arrow: {},
		ship: {},
		ball: {},
		brick: {},
		bricks: {},
		blocksGrp: {},
		handle: {},
		initBallVel: -100,
		numLevels: 15,
		thisLevel: 1,

		// Advertisements
		adCounter: 0,
		adVisibility: 10,

		// Text
		scoreText: {},
		livesText: {},
		gameoverText: {},
		coinsText: {},

		// Sounds
		fireballSnd: {},
		laser: {},
		laserPickupSnd: {},
		biggerSnd: {},
		smallerSnd: {},
		magnetSnd: {},
		ballsSnd: {},
		coinSnd: {},
		tonicSnds: [{}],
		subdomSnds: [{}],
		domSnds: [{}],
		breakSnds: [{}],
		noteCnt: 1,
		// breakBrickSnd: {},
		// bounceWallSnd: {},
		// bounceBatSnd: {},
		winSnd: {},
		deathSnd: {},
		gameOverSnd: {},
		gameMusic: {},
		musicOn: false,
		sfxOn: true,
		audioOn: true,
		offSnd: {},
		onSnd: {},

		// Powerups
		powerupsGrp: {},
		magnetOn: false,
		magnet: {},
		magnetCharges: 1,
		magnetDuration: 300,
		magnetDurationCounter: 0,
		redFireball: {},
		fireball: {},
		fireballOn: false,
		fireballDamage: 50,
		fireballDuration: 600,
		fireballDurationCounter: 0,
		ballsGrp: {},
		laserGrp: {},
		laserSpeed: 8,
		laserCounter: 0,
		laserFiring: false,
		laserDuration: 800,
		laserDurationCounter: 0,

		// Player
		numLives: 3,
		numBricks: 1,
		playerScore: 0,
		hitCount: 1,
		ballIsReset: true,
		hearts: [],
		difficulty: DIFFICULTY_EASY,

		// Input arrow key states
		leftKey: {},
		rightKey: {},
		spaceKey: {},
		left: false,
		right: false,

		// make sure the sound is paused when the app is paused/in the background
		pauseUpdate: function() {
			// this.game.sound.mute = true;
		},

    create: function () {
			// Background
			var scaleWidth = this.game.scale.bounds.width / 600;
			var scaleHeight = this.game.scale.bounds.height / 800;
			var rndBackground = this.rnd.integerInRange(1, 5);
			var bg = this.game.add.sprite(this.game.world.centerX, this.game.world.centerY, 'background' + rndBackground);
			bg.anchor.set(0.5);
			bg.scale.set(scaleWidth, scaleHeight);

			// Load Level
			this.loadLevel('level' + localStorage.loadLevel);
			this.thisLevel = localStorage.loadLevel;

			// Get localstorage variables for powerups
			this.getLocalStorage();

			this.difficulty = localStorage.getItem('difficulty');
			this.ballIsReset = true;
			this.numLives = 3;
			this.playerScore = 0;
			this.laserFiring = false;
			this.resetWin();

			if (this.difficulty == 'easy') {
				VEL_MAX = 400;
				VEL_INCREASE = 15;
				VEL_MIN = 275;
			}
			else if (this.difficulty == 'normal') {
				VEL_MAX = 700;
				VEL_INCREASE = 30;
				VEL_MIN = 450;
			}
			else if (this.difficulty == 'hard') {
				VEL_MAX = 1200;
				VEL_INCREASE = 40;
				VEL_MIN = 500;
			}

			// Debug Text
			info = this.game.add.text(10,0, ' ');
			info.fontSize = 16;
			info.fill = "#ffffff";
			info.lineSpacing = 4;
			info.setShadow(2, 2);

			// Sounds
			for (var i=0; i < 4; i++) {
				this.tonicSnds[i] = this.add.audio('g' + i);
				this.subdomSnds[i] = this.add.audio('c' + i);
				this.domSnds[i] = this.add.audio('d' + i);
				this.tonicSnds[i].volume = 0.1;
				this.subdomSnds[i].volume = 0.1;
				this.domSnds[i].volume = 0.1;
			}
			for (var i=0; i < 6; i++) {
				this.breakSnds[i] = this.add.audio('break' + i);
				this.breakSnds[i].volume = 0.5;
			}
			this.fireballSnd = this.add.audio('fireball-pickup');
			this.fireballSnd.volume = 0.7;
			this.offSnd = this.add.audio('ui-off');
			this.offSnd.volume = 0.5;
			this.onSnd = this.add.audio('ui-on');
			this.onSnd.volume = 0.5;
			this.laserSnd = this.add.audio('laser');
			this.laserSnd.volume = 0.4;
			this.laserPickupSnd = this.add.audio('laser-pickup');
			this.laserPickupSnd.volume = 0.4;
			this.ballsSnd = this.add.audio('balls');
			this.ballsSnd.volume = 0.9;
			this.magnetSnd = this.add.audio('magnet-pickup');
			this.magnetSnd.volume = 0.4;
			this.coinSnd = this.add.audio('coin');
			this.coinSnd.volume = 0.5;
			this.biggerSnd = this.add.audio('bigger');
			this.biggerSnd.volume = 0.5;
			this.smallerSnd = this.add.audio('smaller');
			this.smallerSnd.volume = 0.5;
			// this.breakBrickSnd = this.add.audio('breakBrick');
			// this.bounceBatSnd = this.add.audio('bounceBat');
			this.deathSnd = this.add.audio('death');
			this.deathSnd.volume = 0.1;
			this.gameOverSnd = this.add.audio('gameover');
			this.gameOverSnd.volume = 0.1;
			this.winSnd = this.add.audio('win-jingle');
			this.winSnd.volume = 0.3;
			this.gameMusic = this.add.audio('music');
			this.gameMusic.volume = 0.4;
			this.gameMusic.loop = true;
			if (localStorage.getItem('music') == 'on') {
				if (this.gameMusic.isPlaying == false) {
					this.game.sound.stopAll();
					this.gameMusic.play();
				}
			}

			// Hearts
			for (var i=0; i<this.numLives; i++) {
				this.hearts[i] = this.game.add.sprite(this.game.scale.bounds.width - 100 + i * 30, 15, 'heart');
			}

			// Score Text
			this.scoreText = this.add.bitmapText(15, 15, 'digi', '' + this.playerScore, 22);
			// this.coinsText = this.add.bitmapText(15, 45, 'digi', '' + localStorage.getItem('coins'), 22);


			var self = this;

			// Menu
			$('#menu-btn').one('click', function() {
				self.gotoMainMenu();
			});

			// Replay
			var replayBtn = document.getElementById('replay-btn');
			replayBtn.addEventListener('click', function() {
		    self.restartLevel(self);
			});

			// Play / next
			$('#play-btn').one('click', function() {
				if (localStorage.loadLevel >= self.numLevels) {
					$('#complete-dialog').fadeIn();
					localStorage.loadLevel = 1;
					$('#complete-dialog').fadeIn();
					self.state.start('menu');
				}
				else {
					localStorage.loadLevel++;
			    self.restartLevel(self);
				}
			});


			// Upgrades
			$('#upgrades-btn').off();
			$('#upgrades-btn').one('click', function() {
				self.showUpgrades();
			});

			// Advertisements
			$('#close-ad').off();
			$('#close-ad').on('click', function() {
				self.hideAd();
			});

			// Pause
			$('#pause-btn').off();
			$('#pause-btn').one('click', function() {
				self.showPause();
			});

			this.showPauseButton();

			// Music on/off
			$('#no-music-btn').on('click', function() {
				var music = localStorage.getItem('music');

				if (music == 'off'){
					self.musicOn = true;
					localStorage.setItem('music', 'on');
					$('#no-music-btn').attr('src', 'assets/menu/music.png');
					if (self.gameMusic.isPlaying == false) {
						self.gameMusic = self.add.audio('music');
						self.sound.mute = false;
						self.gameMusic.volume = 0.4;
						self.gameMusic.loop = true;
						self.gameMusic.play();
					}
				}
				else if (music == 'on') {
					// turn music off
					self.musicOn = false;
					localStorage.setItem('music', 'off');
					$('#no-music-btn').attr('src', 'assets/menu/no-music.png');
					if (self.gameMusic.isPlaying == true) {
						self.gameMusic.stop();
					}
				}

			});
			$('#no-audio-btn').on('click', function() {
				if (self.sound.mute) {
					self.sound.mute = false;
				}
				else {
					self.sound.mute = true;
				}
			});
			this.game.sound.onMute.add(function() {
				$('#no-audio-btn').attr('src', 'assets/menu/audio.png');
			},this);
			this.game.sound.onUnMute.add(function() {
				$('#no-audio-btn').attr('src', 'assets/menu/no-audio.png');
			},this);

			$('#pause-upgrades-btn').off();
			$('#pause-upgrades-btn').on('click', function() {
				self.showUpgrades();
			});
			$('#pause-menu-btn').off();
			$('#pause-menu-btn').one('click', function() {
				self.hidePause();
				self.gameMusic.stop();
				self.chanceToShowAd();
				self.state.start('menu');
			});
			$('#pause-replay-btn').off();
			$('#pause-replay-btn').one('click', function() {
				self.hidePause();
				self.state.start('game');
			});
			$('#pause-pause-btn').off();
			$('#pause-pause-btn').on('click', function() {
				self.hidePause();
			});




			// Upgrades Menu
			// Magnet
			$('#magnet').off();
			$('#magnet').on('click', function() {
				var numCoins = parseInt(localStorage.getItem('coins'));
				var magnetCost = 50;
				var durationIncrease = 350;
				if (numCoins >= magnetCost) {
					var curVal = parseInt(localStorage.getItem('magnet'));
					var curDuration = parseInt(localStorage.getItem('magnet-duration'));
					if (curVal % 2 === 0) {
						var curCharges = parseInt(localStorage.getItem('magnet-charges'));
						localStorage.setItem('magnet-charges', curCharges + 1);
					}
					if (curVal < 5) {
						var newVal = curVal + 1;
						var newDuration = curDuration + durationIncrease
						localStorage.setItem('coins', numCoins - magnetCost);
						localStorage.setItem('magnet', newVal);
						localStorage.setItem('magnet-duration', newDuration);
						self.updateCoinsContainer();
						self.updatePurchasedContainer('magnet');
						self.coinSnd.play();
					}

				}
				else {
					self.updateCoinsContainer();
					self.smallerSnd.play();
					// Coins Dialog
					$('#coins-dialog').fadeIn();
				}
			});
			// Fireball
			$('#fireball').off();
			$('#fireball').on('click', function() {
				var numCoins = parseInt(localStorage.getItem('coins'));
				var fireballCost = 75;
				var durationIncrease = 200;
				if (numCoins >= fireballCost) {
					var curVal = parseInt(localStorage.getItem('fireball'));
					var curDuration = parseInt(localStorage.getItem('fireball-duration'));
					if (curVal < 5) {
						var newVal = curVal + 1;
						var newDuration = curDuration + durationIncrease
						localStorage.setItem('coins', numCoins - fireballCost);
						localStorage.setItem('fireball', newVal);
						localStorage.setItem('fireball-duration', newDuration);
						self.updateCoinsContainer();
						self.updatePurchasedContainer('fireball');
						self.coinSnd.play();
					}
				}
				else {
					self.updateCoinsContainer();
					self.smallerSnd.play();
					$('#coins-dialog').fadeIn();
				}
			});
			// Heavy Machine Gun
			$('#laser').off();
			$('#laser').on('click', function() {
				var numCoins = parseInt(localStorage.getItem('coins'));
				var magnetCost = 100;
				if (numCoins >= magnetCost) {
					var curVal = parseInt(localStorage.getItem('laser'));
					if (curVal < 5) {
						var newVal = curVal + 1;
						localStorage.setItem('coins', numCoins - magnetCost);
						localStorage.setItem('laser', newVal);
						self.updateCoinsContainer();
						self.updatePurchasedContainer('laser');
						self.coinSnd.play();
					}
				}
				else {
					self.updateCoinsContainer();
					self.smallerSnd.play();
					$('#coins-dialog').fadeIn();
				}
			});
			// Bag of coins
			$('#bag-coins').off();
			$('#bag-coins').on('click', function() {
				store.order('bag_of_coins');
			});
			// Remove advertisements
			$('#no-ads').off();
			$('#no-ads').one('click', function() {
				store.order('no_ads');
			});
			$('#upgrades-back-btn').off();
			$('#upgrades-back-btn').on('click', function() {
				self.hideUpgrades();
				self.getLocalStorage();
			});

			// Ship
			this.ship = this.game.add.sprite(this.game.world.centerX, this.game.scale.bounds.height - 65, 'bat');
			this.game.physics.enable([this.ball, this.ship], Phaser.Physics.ARCADE);
			this.ship.anchor.set(0.5);
			this.ship.body.immovable = true;
			this.ship.inputEnabled = true;
			this.ship.input.enableDrag();
			this.ship.input.allowVerticalDrag = false;
			this.ship.scale.set(148 / this.game.scale.bounds.width + 0.3, 128 / this.game.scale.bounds.height + 0.75);

			// Arrow
			this.arrow = this.game.add.sprite(this.ship.x, this.ship.y - 45, 'arrow');
			this.game.physics.enable(this.arrow, Phaser.Physics.ARCADE);
			this.arrow.anchor.set(0,0.5);
			this.arrow.rotation = -1.6;
			this.arrow.pivot.x = 0;


			////////////////////////////////////////////////////////////////////////////////////////////////////////////
			// Particle Systems
			////////////////////////////////////////////////////////////////////////////////////////////////////////////

			// Brick break
			this.emitter = this.game.add.emitter(0,0,100);
			this.emitter.makeParticles('brickblue-piece');
			this.emitter.gravity = 80;
			// Ball trail
			this.trailEmitter = this.game.add.emitter(0,0,300);
			// this.trailEmitter.makeParticles('trail')
			this.trailEmitter.makeParticles(['fire1', 'fire2', 'fire3', 'fire4', 'smoke']);
			this.trailEmitter.setAlpha(1, 0, 2000);
			this.trailEmitter.setScale(1, 0, 1, 0, 2000);
			this.trailEmitter.minRotation = 0;
			this.trailEmitter.maxRotation = 0;
			this.trailEmitter.gravity = 250;
			// this.trailEmitter.start(false, 1000, 5);


			////////////////////////////////////////////////////////////////////////////////////////////////////////////
			// Powerups
			////////////////////////////////////////////////////////////////////////////////////////////////////////////

			// Powerup group
			this.powerupsGrp = this.game.add.group();
			this.game.physics.enable(this.ballsGrp, Phaser.Physics.ARCADE);

			// Laser Gun
			this.laserGrp = this.game.add.group();

			// Ball
			this.ballsGrp = this.game.add.group();
			var ball = this.ballsGrp.create(this.game.world.centerX, this.ship.y - 45, 'ball');
			ball.anchor.set(0.5);
			this.game.physics.enable(ball, Phaser.Physics.ARCADE);
			ball.body.collideWorldBounds = true;
			ball.body.bounce.setTo(1, 1);
			ball.body.mass = 3000;
			ball.body.acceleration = 20;
			ball.animations.add('fire-animation');
			ball.animations.play('fire-animation', 16, true);

			// Fireball
			this.fireball = this.game.add.sprite(-100, -100, 'fireball');
			this.fireball.anchor.set(0.5);
			this.fireball.visible = false;

			// Magnet
			this.magnet = this.game.add.sprite(-100, -100, 'magnet');
			this.magnet.anchor.set(0.5);
			this.magnet.visible = false;



			// KEYBOARD INPUT
			this.input.onDown.add(this.onInputDown, this);
			this.upKey = this.game.input.keyboard.addKey(Phaser.Keyboard.UP);
		    this.downKey = this.game.input.keyboard.addKey(Phaser.Keyboard.DOWN);
		    this.leftKey = this.game.input.keyboard.addKey(Phaser.Keyboard.LEFT);
		    this.rightKey = this.game.input.keyboard.addKey(Phaser.Keyboard.RIGHT);
		    this.spaceKey = this.game.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR);
			// this.playerWin();
			// this.showWin();
			// this.showUpgrades();
			this.chanceToShowAd();
    },

		shootLaser: function() {
			var laser = this.laserGrp.create(this.ship.x, this.ship.y - 40, 'laser');
			laser.anchor.set(0.5);
			this.game.physics.enable(laser, Phaser.Physics.ARCADE);
			laser.body.velocity.y = -500;

			// var laser2 = this.laserGrp.create(this.ship.x + this.ship.width / 2 - 20, this.ship.y - 40, 'laser');
			// laser2.anchor.set(0.5);
			// this.game.physics.enable(laser2, Phaser.Physics.ARCADE);
			// laser2.body.velocity.y = -366;

			this.laserSnd.play();
		},

		collideLaserBrick: function(laser, brick) {
			brick.healthPts = brick.healthPts - 100;
			// brick.alpha = 0;// -= 0.5;

			// if (brick.healthPts < 0) {
				this.numBricks--;
				this.playerScore += 55;
				this.releasePowerup(brick.world.x, brick.world.y);
				this.playRandomBreakSnd();
        // this.shakeCamera();

				this.emitter.x = brick.world.x;
				this.emitter.y = brick.world.y;
				this.emitter.setAlpha(0.1, 1);
				this.emitter.start(true, 800, null, 10);

				// var tween = this.game.add.tween(brick).to( { alpha: 0 }, 200, Phaser.Easing.Linear.Out, true);
				// tween.onComplete.add(function() {
					brick.kill();
					brick.destroy();
					this.graveyard.push(brick);
					this.graveyard.push(laser);
				// }, this);
			// } else {
				// this.playHarmonicSfx();
				// this.graveyard.push(laser);
			// }

		},

    update: function () {
			// Update Physics
			// this.game.physics.arcade.collide(this.ship, this.ball, this.collideBatBall, null, this);
			this.game.physics.arcade.collide(this.ship, this.ballsGrp, this.collideBatBall, null, this);
			this.game.physics.arcade.collide(this.ballsGrp, this.objectLayer, this.breakBrick, null, this);
			// this.game.physics.arcade.collide(this.ballsGrp, this.tileLayer, this.collideBallWall, null, this);
			this.game.physics.arcade.collide(this.powerupsGrp, this.ship, this.collidePowerups, null, this);
			this.game.physics.arcade.collide(this.laserGrp, this.objectLayer, this.collideLaserBrick, null, this);
			this.trailEmitter.x = this.ballsGrp.children[0].x;
			this.trailEmitter.y = this.ballsGrp.children[0].y;

			if (this.spaceKey.isDown) {
				this.onInputDown();
			}

			// Arrow
			this.updateArrow();

			// Laser
			if (this.laserFiring) {
				if (this.laserCounter == this.laserSpeed) {
					this.shootLaser();
					this.laserCounter = 0;
				}
				else {
					this.laserCounter++;
				}

				if (this.laserDurationCounter >= this.laserDuration) {
					this.laserDurationCounter = 0;
					this.laserFiring = false;
				}
				this.laserDurationCounter++;
			}

			// Fireball
			if (this.fireballOn) {
				// Duration counter
				if (this.fireballDurationCounter >= this.fireballDuration) {
					this.fireballDurationCounter = 0;
					this.fireballOn = false;
					this.trailEmitter.on = false;
				}
				this.fireballDurationCounter++;
			}


			// Magnet
			if (this.magnetOn) {
				this.magnet.visible = true;
				this.magnet.x = this.ship.x;
				this.magnet.y = this.ship.y - 55;

				// Duration Counter
				if (this.magnetDurationCounter >= this.magnetDuration) {
					this.magnetDurationCounter = 0;
					this.magnetOn = false;
				}
				this.magnetDurationCounter++;
			}
			else {
				this.magnet.visible = false;
			}



	    if (this.leftKey.isDown)
	    {
	        this.ship.x-=15;
					// this.releaseBall(100, 100);
	    }
	    else if (this.rightKey.isDown)
	    {
	        this.ship.x+=15;
	    }

			if (this.game.input.keyboard.isDown(Phaser.Keyboard.SPACEBAR))
	    {
	        this.showDebug = !this.showDebug;
	    }

			// Update ship movement (buttons)
			if (this.left) {
				this.ship.x-=5;
			}
			else if (this.right) {
				this.ship.x+=5;
			}

			// constrain ship movement to screen bounds
			if (this.ship.x >= (this.game.scale.bounds.width)) {
				this.ship.x = this.game.scale.bounds.width;
			}
			if (this.ship.x <= 0) {
				this.ship.x = 0;
			}

			// check for death
			// if (this.ball.y >= (this.game.scale.bounds.height - 17)) {
			// 				this.killPlayer();
			// 			}

			var numBalls = this.ballsGrp.children.length;
			for (var i=0; i < this.ballsGrp.children.length; i++) {
				if (this.ballsGrp.children[i].y >= (this.game.scale.bounds.height - 17)) {
					if (this.ballIsReset == false) {
						if (numBalls <= 1) {
							this.killPlayer();
						}
						else {
							this.ballsGrp.children[i].destroy();
						}
					}
				}
			}

			// check for game over
			if (this.numLives == 0) {
				this.gameOver();
			}

      // check for low bricks
      if (this.numBricks <= 20) {
        this.objectLayer.forEach(function(item) {
  				// Give it gravity
  				item.body.gravity.y = 10 + Math.random() * 100;

          // check if brick reached floor via gravity
          if (item.y >= this.game.world.height - 320) {
            // console.log(item.x);

            this.numBricks--;
    				this.playerScore += 80;
    				this.playRandomBreakSnd();
    				this.scoreText.text = '' + this.playerScore;
    				item.body.enable = false;

    				this.emitter.x = item.world.x;
    				this.emitter.y = item.world.y;
    				this.emitter.setAlpha(0.1, 1);
    				this.emitter.start(true, 800, null, 10);

  					item.kill();
  					item.destroy();
            // this.breakBrick(this.ballsGrp, item);
          }
  			}, this);
      }



			// check for win
			if (this.numBricks == 0 && !this.isGameOver) {
				this.playerWin();
			}

			if (this.autoPlay) {
				// this.ship.x = this.ball.x;
			}

			if (this.ballIsReset) {
				this.ship.x = this.game.world.centerX;
			}

			// animate score
			if (this.animateScore) {
				this.updateScoreAnimation();
			}

			// this.ball.bringToTop()

			for (var i=0; i < this.graveyard.length; i++) {
				// console.log(this.graveyard[i].key);
				this.graveyard[i].destroy();
				this.graveyard.splice(i,1);
			}

			// Update Debug Text
			if (this.debugMode) {
				this.updateDebug();
			}
    },

		playRandomBreakSnd: function() {
			var rnd = this.rnd.integerInRange(0,5);
			// console.log(rnd);
			// console.log(this.breakSnds);
			this.breakSnds[rnd].play();
		},

		playHarmonicSfx: function() {
			// this.playArpTonic();
			// return;

			if (this.hitCount > 32) {
				this.hitCount = 1;
			}
			else if (this.hitCount <= 16) {
				this.playArpTonic();
			}
			else if (this.hitCount > 16 && this.hitCount <= 24) {
				this.playArpSubDom();
			}
			else if (this.hitCount > 24) {
				this.playArpTonic();
				this.hitCount++;
				return;

				// this.playArpDom();
				var rnd = this.rnd.integerInRange(0,1);
				if (rnd) {
					this.playArpDom();
				}
				else {
					this.playArpSubDom();
				}
			}
			this.hitCount++;
		},

		playRandomTonic: function() {
			var rnd = this.rnd.integerInRange(0,3);
			this.tonicSnds[rnd].play();
		},

		playRandomSubDom: function() {
			var rnd = this.rnd.integerInRange(0,3);
			this.subdomSnds[rnd].play();
		},

		playArpTonic: function() {
			if (this.noteCnt > 4) {
				this.noteCnt = 1;
			}
			this.tonicSnds[this.noteCnt - 1].play();
			this.noteCnt++;
		},

		playArpSubDom: function() {
			if (this.noteCnt > 4) {
				this.noteCnt = 1;
			}
			this.subdomSnds[this.noteCnt - 1].play();
			this.noteCnt++;
		},

		playArpDom: function() {
			if (this.noteCnt > 4) {
				this.noteCnt = 1;
			}
			this.domSnds[this.noteCnt - 1].play();
			this.noteCnt++;
		},

		collideBallWall: function() {
			// this.playHarmonicSfx();
			this.playRandomBreakSnd();
			return;

			var velX = 200; //TODO: add velocity //this.ball.body.velocity.x;
			var velY = 200; //this.ball.body.velocity.y;

			// do nothing if ball is max or min velocity
			if (Math.abs(velX) > VEL_MAX) {
				// this.ball.body.velocity.setTo(VEL_MAX, velY);
				return;
			}
			else if (Math.abs(velX) < VEL_MIN) {
				// this.ball.body.velocity.setTo(VEL_MIN, velY);
				return;
			}

			// var random = this.rnd.integerInRange(-200, 200);
			// this.ball.body.velocity.setTo(velX + random, velY);
		},

		collideBatBall: function(bat, ball) {
			this.playHarmonicSfx();
			var difference = Math.abs(ball.x) - Math.abs(bat.x);

			if (this.difficulty == 'easy') {
				ball.body.velocity.x = difference * 7;
			}
			else if (this.difficulty == 'normal') {
				ball.body.velocity.x = difference * 8;
			}
			else if (this.difficulty == 'hard') {
				ball.body.velocity.x = difference * 10;
			}
			else {
				ball.body.velocity.x = difference * 7;
			}


			if (Math.abs(ball.body.velocity.y) < VEL_MIN) {
				if (ball.body.velocity.y > 0) {
					ball.body.velocity.y = VEL_MIN;
				}
				else {
					ball.body.velocity.y = -VEL_MIN;
				}
			}

			if (this.magnetOn) {
				this.resetBall(ball);
				this.resetPlayer();
				this.resetArrow();
				this.magnetCharges--;
				this.magnetSnd.play();

				// reset charges to init if depleted
				if (this.magnetCharges <= 0) {
					this.magnetOn = false;
					this.magnet.visible = false;
					this.magnetCharges = localStorage.getItem('magnet-charges');
				}
			}
		},

		increaseBallVel: function(ball) {
			var velX = ball.body.velocity.x;
			var velY = ball.body.velocity.y;

			// do nothing if ball is max velocity
			if (Math.abs(velY) > VEL_MAX) {
				return;
			}

			if (velY > 0) {
				// increase ball velocity
				ball.body.velocity.setTo(velX, velY + VEL_INCREASE);
			}
			else {
				// increase ball velocity
				//this.ball.body.velocity.setTo(velX, velY - VEL_INCREASE);
			}

		},

		releaseBall: function(x,y) {
			for (var i=0; i<2; i++) {
				var ball = this.ballsGrp.create(x,y,'ball');
				var random = this.rnd.integerInRange(-3, 3);

				if (random == 0) {
					random = 0.5;
				}

				ball.anchor.set(0.5);
				ball.rotation = random;
				this.game.physics.enable(ball, Phaser.Physics.ARCADE);
				ball.body.velocity.setTo(25);
				ball.body.collideWorldBounds = true;
		    ball.body.bounce.setTo(1, 1);
				this.game.physics.arcade.velocityFromAngle(ball.angle, 300, ball.body.velocity);
			}
		},

		fireLaser: function() {
			this.laserFiring = true;
		},

		collidePowerups: function(player, powerup) {
			if (powerup.key == 'magnet') {
				this.magnetOn = true;
				this.magnetDurationCouter = 0;
				this.magnetCharges = localStorage.getItem('magnet-charges');
				this.magnetSnd.play();
			}

			if (powerup.key == 'bigger') {
				this.growBat();
				this.biggerSnd.play();
			}
			if (powerup.key == 'smaller') {
				this.shrinkBat();
				this.smallerSnd.play();
			}

			if (powerup.key == 'balls') {
				this.releaseBall(this.ballsGrp.children[0].world.x, this.ballsGrp.children[0].world.y);
				this.ballsSnd.play();
			}

			if (powerup.key == 'laser-powerup') {
				this.fireLaser();
				this.laserPickupSnd.play();
			}

			if (powerup.key == 'coin') {
				var random = this.rnd.integerInRange(0, 10);
				var coinTxt = this.add.bitmapText(player.world.x - random, player.world.y - player.height + random * 2,'digi', '+1', 10);
				coinTxt.anchor.set(0.5);

				var numCoins = parseInt(localStorage.getItem('coins'));
				this.coinSnd.play();
				localStorage.setItem('coins', numCoins + 1);
				// this.coinsText.text = localStorage.getItem('coins');

				coinTxt.alpha = 1;
				var newY = player.world.y - 100;
				var textTween = this.game.add.tween(coinTxt).to({
					alpha: 0.0,
					y: newY
				}, 1000, Phaser.Easing.Linear.Out, true);
			}

			if (powerup.key == 'fireball') {
				this.fireballSnd.play();
				this.fireballOn = true;
				this.fireballDurationCounter = 0;
				this.trailEmitter.start(false, 1000, 5);
			}

			powerup.destroy();
			powerup.kill();
		},

		releasePowerup: function(x, y, type) {
			var random;

			if (type == 'fireball') {
				random = 21;
			}
			else if (type == 'magnet') {
				random = 0;
			}
			else if (type == 'bigger') {
				random = 1;
			}
			else if (type == 'smaller') {
				random = 2;
			}
			else if (type == 'balls') {
				random = 3;
			}
			else if (type == 'laser') {
				random = 4;
			}
			else if (type == 'coin') {
				random = 5;
			}
			else {
				random = this.rnd.integerInRange(0, 42); // 1 in 2 chance powerup released
			}

			// random = 4;
			// random = this.rnd.integerInRange(0, 1);
			// 			if (random == 1) {
			// 				random = 3;
			// 			}

			// return if last brick
			if (this.objectLayer.children.length <= 1) {
				return;
			}

			// Magnet
			if (random == 99999999 && !this.magnetOn) {
				var powerup = this.powerupsGrp.create(x,y,'magnet');
				powerup.anchor.set(0.5);
				this.game.physics.enable(powerup, Phaser.Physics.ARCADE);
				powerup.body.gravity.y = 100;
				powerup.alpha = 0;
				var tween = this.game.add.tween(powerup).to( { alpha: 1 }, 400, Phaser.Easing.Linear.Out, true);
			}

			// Bigger
			if (random == 1) {
				var powerup = this.powerupsGrp.create(x,y+40,'bigger');
				powerup.anchor.set(0.5);
				this.game.physics.enable(powerup, Phaser.Physics.ARCADE);
				powerup.alpha = 0;
				var tween = this.game.add.tween(powerup).to( { alpha: 1 }, 400, Phaser.Easing.Linear.Out, true);
				powerup.body.gravity.y = 120;
			}

			// Smaller
			if (random == 2) {
				var powerup = this.powerupsGrp.create(x,y+40,'smaller');
				powerup.anchor.set(0.5);
				this.game.physics.enable(powerup, Phaser.Physics.ARCADE);
				powerup.alpha = 0;
				var tween = this.game.add.tween(powerup).to( { alpha: 1 }, 400, Phaser.Easing.Linear.Out, true);
				powerup.body.gravity.y = 140;
			}

			// Balls
			if (random == 3) {
				var powerup = this.powerupsGrp.create(x,y+40,'balls');
				powerup.anchor.set(0.5);
				this.game.physics.enable(powerup, Phaser.Physics.ARCADE);
				powerup.alpha = 0;
				var tween = this.game.add.tween(powerup).to( { alpha: 1 }, 400, Phaser.Easing.Linear.Out, true);
				powerup.body.gravity.y = 110;
			}

			// Laser
			if (random == 4) {
				var powerup = this.powerupsGrp.create(x,y+40,'laser-powerup');
				powerup.anchor.set(0.5);
				this.game.physics.enable(powerup, Phaser.Physics.ARCADE);
				powerup.alpha = 0;
				var tween = this.game.add.tween(powerup).to( { alpha: 1 }, 400, Phaser.Easing.Linear.Out, true);
				powerup.body.gravity.y = 180;
			}

			// Coin
			if (random >= 5 && random <= 20) {
				// var coin = this.game.add.sprite(x, y, 'coin');
				var coin = this.powerupsGrp.create(x,y+40,'coin');
				coin.anchor.set(0.5);
				coin.animations.add('spin');
				coin.animations.play('spin', 5, true);
				coin.scale.set(0.8);
				this.game.physics.enable(coin, Phaser.Physics.ARCADE);
				coin.alpha = 0;
				var tween = this.game.add.tween(coin).to( { alpha: 1 }, 400, Phaser.Easing.Linear.Out, true);
				coin.body.gravity.y = 80;
			}

			// Fireball
			if (random == 21) {
				var powerup = this.powerupsGrp.create(x,y+40,'fireball');
				powerup.anchor.set(0.5);
				this.game.physics.enable(powerup, Phaser.Physics.ARCADE);
				powerup.alpha = 0;
				var tween = this.game.add.tween(powerup).to( { alpha: 1 }, 400, Phaser.Easing.Linear.Out, true);
				powerup.body.gravity.y = 100;
			}

		},

		shrinkBat: function() {
			if (this.ship.scale.x > 0.3) {
				this.ship.scale.set(this.ship.scale.x - 0.25, this.ship.scale.y);
			}
		},
		growBat: function() {
			if (this.ship.scale.x < 1.2) {
				this.ship.scale.set(this.ship.scale.x + 0.05, this.ship.scale.y);
			}
		},

		breakBrick: function(ball, brick) {
			// if (brick.breakable == 'false') {
			// 	this.playHarmonicSfx();
			// 	return;
			// }

      // this.shakeCamera();
			if (this.fireballOn) {
				brick.alpha -= 0.5;
				brick.healthPts = brick.healthPts - 200;
        this.shakeCamera();
			}
			else {
				if (this.difficulty == 'easy') {
					brick.healthPts = brick.healthPts - 500;
					if (brick.alpha > 0.0) {
						// brick.alpha -= 0.5;
						brick.alpha = 0;
					}
				}
				else if (this.difficulty == 'normal') {
					brick.healthPts = brick.healthPts - 34;
					if (brick.alpha > 0.0) {
						brick.alpha -= 0.33;
					}
				}
				else if (this.difficulty == 'hard') {
					brick.healthPts = brick.healthPts - 20;
					if (brick.alpha > 0.0) {
						brick.alpha -= 0.2;
					}
				}
			}


			if (brick.healthPts <= 0) {
				this.increaseBallVel(ball);
				this.numBricks--;
				this.playerScore += 80;
				this.releasePowerup(brick.world.x, brick.world.y, brick.powerup);
				// this.breakBrickSnd.play();
				// this.playHarmonicSfx();
				this.playRandomBreakSnd();
				this.scoreText.text = '' + this.playerScore;
				brick.body.enable = false;

				this.emitter.x = brick.world.x;
				this.emitter.y = brick.world.y;
				this.emitter.setAlpha(0.1, 1);
				this.emitter.start(true, 800, null, 10);

				var tween = this.game.add.tween(brick).to( { alpha: 0 }, 200, Phaser.Easing.Linear.Out, true);
				tween.onComplete.add(function() {
					brick.kill();
					brick.destroy();
				}, this);
			} else {
				this.playHarmonicSfx();
			}

			// console.log('health pts: ' + brick.healthPts);





			if (this.difficulty == DIFFICULTY_HARD) {
				if (this.ship.width > 60) {
					this.ship.scale.set(this.ship.scale.x - 0.001, this.ship.scale.y);
				}
			}
		},

		resetBall: function(ball) {
			if (ball != undefined) {
				ball.destroy();
				// console.log('resetting ball... ball defined as:');
				// console.log(ball);
			}
			else {
				this.ballsGrp.removeAll();
			}
			// this.ballsGrp.children[0].destroy();

			var ball = this.ballsGrp.create(this.game.world.centerX, this.ship.y - 45, 'ball');
			ball.anchor.set(0.5);
			this.game.physics.enable(ball, Phaser.Physics.ARCADE);
			ball.body.collideWorldBounds = true;
			ball.body.bounce.setTo(1, 1);
			this.ballIsReset = true;
		},

		resetPlayer: function() {
			this.ship.x = this.game.world.centerX;
			this.ship.y = this.game.scale.bounds.height - 65;
		},

		resetArrow: function() {
			this.arrow.visible = true;
		},

		resetBricks: function() {
			this.numBricks = this.objectLayer.children.length;
		},

		resetGame: function() {
			this.resetBricks();
			this.resetBall();
			this.resetPlayer();
			this.resetLives()
		},

		killPlayer: function() {
			this.deathSnd.play();
			this.resetBall();
			this.resetPlayer();
			this.resetArrow();
			this.laserFiring = false;
			this.subtractLife();
			this.removePowerups();
		},

		removePowerups: function() {
			this.powerupsGrp.removeAll();
			return;
			for (var i=0; i < this.powerupsGrp.children.length; i++) {
				this.powerupsGrp.children[i].destroy();
			}
		},

		resetPlayerScore: function() {
			this.playerScore = 0;
			this.scoreText.text = '' + this.playerScore;
		},

		subtractLife: function() {
			this.numLives--;
			this.livesText.text = 'LIVES: ' + this.numLives;
			this.hearts[this.numLives].alpha = 0.1;
		},

		resetLives: function() {
			this.numLives = 3;
			this.livesText.text = 'LIVES: ' + this.numLives;
			// for (var i=0; i<this.numLives-1; i++) {
				this.hearts[0].alpha = 1;
				this.hearts[1].alpha = 1;
				this.hearts[2].alpha = 1;
			// }
		},

		gameOver: function() {
			this.isGameOver = true;
			this.gameOverSnd.play();
			this.numLives = 3;

			// Game Over Text
			this.gameoverText = this.add.bitmapText(this.game.world.centerX, this.game.world.centerY - 11,'digi', 'Game Over', 22);
			this.gameoverText.anchor.set(0.5);

			this.gameoverText.alpha = 0;
			var gameoverTween = this.game.add.tween(this.gameoverText).to({
				alpha: 1.0
			}, 2000, Phaser.Easing.Bounce.Out, true);

			var self = this;
			this.input.onDown.add(function() {
				if (this.isGameOver) {
					this.gameoverText.destroy();
					this.restartLevel(self);
				}
			}, this);
		},

		restartLevel: function(self) {
			self.chanceToShowAd();
			self.map.destroy();
			self.resetGame();
			self.resetPlayerScore();
			self.gameMusic.stop();
			self.isGameOver = false;
			self.game.paused = false;
			// self.loadLevel('level' + localStorage.loadLevel);
			self.state.start('game');
			$('#win').fadeOut();
			$('#pause-btn').one('click', function() {
				self.showPause();
			});
		},

		playerWin: function() {
			var localData = JSON.parse(localStorage.getItem('levels'));
			var nextLevel = localStorage.getItem('loadLevel');
			localData[this.thisLevel].unlocked = true;
			localData[nextLevel - 1].stars = this.numLives;


			var  bestScore = localStorage.getItem('bestScore');
			if (this.score > bestScore) {
				localData[nextLevel - 1].bestScore = this.score;
			}

			localStorage.setItem('levels', JSON.stringify(localData));
			this.winSnd.play();
			// this.gameMusic.stop();
			this.resetGame();
			this.isGameOver = true;
			this.showWin();
		},

		showAd: function() {
			if (localStorage.getItem('ads') == 1) {
				$('#startappContainer iframe').attr('src', $('#startappContainer iframe').attr('src'));
				$('#startappContainer').fadeIn();
			}
		},
		hideAd: function() {
			$('#startappContainer').fadeOut();
		},
		chanceToShowAd: function() {
			if (this.adCounter >= this.adVisibility) {
				this.showAd();
				this.adCounter = 0;
			}
			else {
				this.adCounter++;
			}
		},

		showPauseButton: function() {
			var pauseBtn = document.getElementById('pause-btn');
			pauseBtn.style.display = 'block';
		},
		hidePauseButton: function() {
			var pauseBtn = document.getElementById('pause-btn');
			pauseBtn.style.display = 'none';
		},


		hidePause: function() {
			var self = this;
			this.game.paused = false;
			var pauseContainer = document.getElementById('pause-container');
			var animationEvent = this.whichAnimationEvent();

			$('#pause-btn').one('click', function() {
				self.showPause();
			});

			if (pauseContainer.classList.contains('zoomOutUp')) {
				pauseContainer.classList.remove('zoomOutUp');
			}
			else if (pauseContainer.classList.contains('zoomInDown')) {
				pauseContainer.classList.remove('zoomInDown');
			}
			else if (pauseContainer.classList.contains('exit')) {
				pauseContainer.classList.remove('exit');
			}

			if (pauseContainer.classList) {
				pauseContainer.classList.add('zoomOutUp');
			}
			else {
				pauseContainer.className += ' zoomOutUp';
			}
		},


		showPause: function() {
			this.chanceToShowAd();
			var self = this;
			var pauseContainer = document.getElementById('pause-container');
			var animationEvent = this.whichAnimationEvent();
			this.game.paused = true;

			if (pauseContainer.classList.contains('zoomOutUp')) {
				pauseContainer.classList.remove('zoomOutUp');
			}
			else if (pauseContainer.classList.contains('zoomInDown')) {
				pauseContainer.classList.remove('zoomInDown');
			}
			else if (pauseContainer.classList.contains('exit')) {
				pauseContainer.classList.remove('exit');
			}
			pauseContainer.style.display = 'block';

			if (pauseContainer.classList) {
				pauseContainer.classList.add('zoomInDown');
			}
			else {
				pauseContainer.className += ' zoomInDown';
			}

			$('#pause-btn').one('click', function() {
				self.hidePause();
			});
		},


		hideWin: function() {
			var self = this;
			var winContainer = document.getElementById('win');
			var animationEvent = this.whichAnimationEvent();
			setTimeout(function() {
				self.game.paused = false;
			}, 1100);

			// $('#pause-btn').one('click', function() {
			// 	self.gotoMainMenu();
			// }, false);
			//

			$('#pause-btn').off();
			$('#pause-btn').one('click', function() {
				self.showPause();
			});

			if (winContainer.classList.contains('zoomOutUp')) {
				winContainer.classList.remove('zoomOutUp');
			}
			else if (winContainer.classList.contains('zoomInDown')) {
				winContainer.classList.remove('zoomInDown');
			}
			else if (winContainer.classList.contains('exit')) {
				winContainer.classList.remove('exit');
			}

			if (winContainer.classList) {
				winContainer.classList.add('zoomOutUp');
			}
			else {
				winContainer.className += ' zoomOutUp';
			}
		},

		resetWin: function() {
			$('.star-left').css('display', 'none');
			$('.star-middle').css('display', 'none');
			$('.star-right').css('display', 'none');
			$('.score').css('display', 'none');
			$('.best-score').css('display', 'none');
			$('.coins').css('display', 'none');
		},

		showWin: function() {
			var self = this;
			var winContainer = document.getElementById('win');
			var animationEvent = this.whichAnimationEvent();

			var gameContainer = document.getElementById('yophaser-game');
			$('#menu-btn').one('click', function() {
				self.gotoMainMenu();
			}, false);
			if (winContainer.classList.contains('zoomOutUp')) {
				winContainer.classList.remove('zoomOutUp');
			}
			else if (winContainer.classList.contains('zoomInDown')) {
				winContainer.classList.remove('zoomInDown');
			}
			else if (winContainer.classList.contains('exit')) {
				winContainer.classList.remove('exit');
			}

			setTimeout(function() {
				winContainer.style.display = 'block';
				self.game.paused = false;

				if (winContainer.classList) {
					winContainer.classList.add('zoomInDown');
				}
				else {
					winContainer.className += ' zoomInDown';
				}

				setTimeout(function() {
					$('.star-middle').css('display', 'inline-block');
					$('.star-middle').addClass('animated rollIn');
				}, 1200);
				setTimeout(function() {
					$('.star-right').css('display', 'inline-block');
					$('.star-right').addClass('animated rollIn');
				}, 2250);
				setTimeout(function() {
					$('.star-left').css('display', 'inline-block');
					$('.star-left').addClass('animated rollIn');
				}, 3750);

				$('#score').text(self.playerScore);
				var bestScore = localStorage.getItem('bestScore');
				$('#best-score').text(bestScore); // TODO: Implement localstorage best score for every level

				setTimeout(function() {
					$('.score').css('display', 'block');
					$('.score').addClass('animated fadeIn');
				}, 3000);

				setTimeout(function() {
					$('.best-score').css('display', 'block');
					$('.best-score').addClass('animated fadeIn');
				}, 4000);
				setTimeout(function() {
					$('.coins').css('display', 'block');
					$('.coins').addClass('animated fadeIn');
				}, 2000);
				self.animateScore = true;
				self.game.paused = false;
			},800);

		},

		updateScoreAnimation: function() {
			this.game.paused = false;

			$('#coins').text(this.scoreCounter);

			if (this.scoreCounter >= parseInt(localStorage.getItem('coins'))) {
				this.scoreCounter = 0;
				this.animateScore = false;
			}
			else {
				this.scoreCounter++;
			}
		},

		hideUpgrades: function() {
			$('#upgrades-container').fadeOut();
			$('.upgrades-back').fadeOut();
		},
		updateCoinsContainer: function() {
			var coinsInv = localStorage.getItem('coins');
			// console.log('updating coins to ' + coinsInv);
			$('#coins-inv').text(coinsInv);
		},
		updatePurchasedContainer: function(type) {
			var cnt = parseInt(localStorage.getItem(type));
			$('#'+type+'Count').attr('src', 'assets/menu/row-purchased-'+cnt+'.png');
		},
		showUpgrades: function() {
			var self = this;
			self.sound.mute = false; // TODO: Implement own audio pause/checking mechanism
			self.chanceToShowAd();
			$('#upgrades-container').fadeIn();
			$('.upgrades-back').fadeIn(2000);
			$('.item').css('display', 'block');
			$('.item').addClass('zoomInDown fadeIn animated');
			this.updateCoinsContainer();
			this.updatePurchasedContainer('magnet');
			this.updatePurchasedContainer('fireball');
			this.updatePurchasedContainer('laser');
		},

		gotoMainMenu: function() {
			this.chanceToShowAd();
			var menuBtn = document.getElementById('menu-btn');
			var winContainer = document.getElementById('win');
			var animationEvent = this.whichAnimationEvent();
			this.game.paused = false;

			if (winContainer.classList) {
				winContainer.classList.add('exit');
				winContainer.classList.add('zoomOutUp');
			}
			else {
				winContainer.className += ' zoomOutUp';
			}

			var self = this;
			// Animation finsihed
			$('#win').one(animationEvent, function() {
				winContainer.style.display = 'none';
				self.hidePauseButton();
				self.chanceToShowAd();
				self.state.start('menu');

				$('#menu-btn').one('click', function() {
					self.gotoMainMenu();
				});
			});
		},

		getLocalStorage: function() {
			this.magnetDuration = localStorage.getItem('magnet-duration');
			this.magnetCharges = localStorage.getItem('magnet-charges');
			this.fireballDuration = localStorage.getItem('fireball-duration');
			// console.log('magnet duration: ' + this.magnetDuration);
			// console.log('magnet charges: ' + this.magnetCharges);
		},

		updateDebug: function() {
			var s = "Game size: " + this.game.width + " x " + this.game.height + "\n";
			s = s.concat("Actual size: " + this.game.scale.width + " x " + this.game.scale.height + "\n");
			s = s.concat("minWidth: " + this.game.scale.minWidth + " - minHeight: " + this.game.scale.minHeight + "\n");
			s = s.concat("maxWidth: " + this.game.scale.maxWidth + " - maxHeight: " + this.game.scale.maxHeight + "\n");
			s = s.concat("aspect ratio: " + this.game.scale.aspectRatio + "\n");
			s = s.concat("parent is window: " + this.game.scale.parentIsWindow + "\n");
			s = s.concat("bounds x: " + this.game.scale.bounds.x + " y: " + this.game.scale.bounds.y + " width:"
			+ this.game.scale.bounds.width + " height: " + this.game.scale.bounds.height + "\n");
			s = s.concat('Scale Mode: ' + this.scale.scaleMode + "\n");

			s = s.concat('rot: ' + this.arrow.rotation + "\n");
			s = s.concat('angularVelocity: ' + this.arrow.body.angularVelocity + "\n");
	    s = s.concat('angularAcceleration: ' + this.arrow.body.angularAcceleration + "\n");
	    s = s.concat('angularDrag: ' + this.arrow.body.angularDrag + "\n");
	    // s = s.concat('bat: ' + this.ship + "\n");

			s = s.concat('ball x vel: ' + this.ballsGrp.children[0].body.velocity.x + "\n");
			s = s.concat('ballx: ' + this.ballsGrp.children[0].x + "\n");

      s = s.concat('numBricks: ' + this.numBricks + "\n");
      s = s.concat('thisLevel: ' + this.thisLevel + "\n");

			info.text = s;
		},

		// Detect which animation event type browser uses
		whichAnimationEvent: function() {
			var t,
      el = document.createElement("fakeelement");

		  var animations = {
		    "animation"      : "animationend",
		    "OAnimation"     : "oAnimationEnd",
		    "MozAnimation"   : "animationend",
		    "WebkitAnimation": "webkitAnimationEnd"
		  }

		  for (t in animations){
		    if (el.style[t] !== undefined){
		      return animations[t];
		    }
		  }
		},

		// Detect which transition event type browser uses
		whichTransitionEvent: function() {
			var t,
      el = document.createElement("fakeelement");

		  var transitions = {
		    "transition"      : "transitionend",
		    "OTransition"     : "oTransitionEnd",
		    "MozTransition"   : "transitionend",
		    "WebkitTransition": "webkitTransitionEnd"
		  }

		  for (t in transitions){
		    if (el.style[t] !== undefined){
		      return transitions[t];
		    }
		  }
		},

		loadLevel: function(levelName) {
			var bgLayerName = 'Background Layer 1';
			var logScope = 'game.loadLevel(' + levelName + ') ';
			// levelName = 'level6';
			this.map = this.game.add.tilemap(levelName);

			this.isGameOver = false;

      localStorage.setItem('loadLevel', levelName.slice(-1));

			// Background Layer
			// console.log('LOADING: ' + logScope + bgLayerName + '...');
			// this.map.addTilesetImage('background');
			// this.tileLayer = this.map.createLayer(bgLayerName);
			if (this.tileLayer === undefined) {
				// console.error(logScope + 'createLayer(' + bgLayerName + ') = ' + this.tileLayer);
				return false;
			}
			else {
				// this.tileLayer.scale.set(2, 2);
			}



			var scaleWidth = this.game.scale.bounds.width / 600;
			var scaleHeight = this.game.scale.bounds.height / 800;

			// Tile Layer
			// this.map.addTilesetImage('tileset');
			// this.tileLayer = this.map.createLayer('Tile Layer 1');
			// this.tileLayer.scale.set(scaleWidth, scaleHeight);

			// Object Layer
			this.objectLayer = this.game.add.group();
			this.objectLayer.enableBody = true;
			this.map.createFromObjects('Object Layer 1', 1, 'brickblue', 0, true, false, this.objectLayer);
			this.map.createFromObjects('Object Layer 1', 2, 'brickblue2', 0, true, false, this.objectLayer);
			this.map.createFromObjects('Object Layer 1', 3, 'brickgreen', 0, true, false, this.objectLayer);
			this.map.createFromObjects('Object Layer 1', 4, 'brickgreen2', 0, true, false, this.objectLayer);
			this.map.createFromObjects('Object Layer 1', 5, 'brickorange', 0, true, false, this.objectLayer);
			this.map.createFromObjects('Object Layer 1', 6, 'brickorange2', 0, true, false, this.objectLayer);
			this.map.createFromObjects('Object Layer 1', 7, 'brickpink', 0, true, false, this.objectLayer);
			this.map.createFromObjects('Object Layer 1', 8, 'brickpurple2', 0, true, false, this.objectLayer);
			this.map.createFromObjects('Object Layer 1', 9, 'brickred', 0, true, false, this.objectLayer);
			this.map.createFromObjects('Object Layer 1', 10, 'brickred2', 0, true, false, this.objectLayer);
			this.map.createFromObjects('Object Layer 1', 11, 'brickteal', 0, true, false, this.objectLayer);
			this.map.createFromObjects('Object Layer 1', 12, 'brickteal2', 0, true, false, this.objectLayer);
			this.map.createFromObjects('Object Layer 1', 13, 'brickwhite', 0, true, false, this.objectLayer);
			this.map.createFromObjects('Object Layer 1', 14, 'brickwhite2', 0, true, false, this.objectLayer);
			this.map.createFromObjects('Object Layer 1', 15, 'brickyellow', 0, true, false, this.objectLayer);
			this.map.createFromObjects('Object Layer 1', 16, 'brickyellow2', 0, true, false, this.objectLayer);
			this.map.createFromObjects('Object Layer 1', 17, 'brickyellow2', 0, true, false, this.objectLayer);
			var numUnbreakables = 0;
			this.objectLayer.forEach(function(item) {
				// if (item.breakable == 'false') {
				// 	numUnbreakables++;
				// }
				if (item.healthPts == undefined) {
					item.healthPts = 100;
				}
				item.body.immovable = true;
			}, this);
			this.numBricks = this.objectLayer.children.length;// - numUnbreakables;

			// this.tileLayer.scale.set(scaleWidth, scaleHeight);
			this.objectLayer.scale.set(scaleWidth, scaleHeight);

			// console.log(this.objectLayer);

			// this.map.setCollisionBetween(0, 12, true, this.tileLayer);
			// this.tileLayer.game.physics.arcade.enable(this.map);
			// this.tileLayer.resizeWorld();
			// this.tileLayer.game.physics.setBoundsToWorld();
		},

		// Update arrow rotation
		updateArrow: function() {
			this.arrow.body.angularVelocity = 0;
			this.arrow.body.velocity.x = 0;
			this.arrow.body.velocity.y = 0;

			if (this.arrow.rotation > -0.5) {
				this.arrowRotateLeft = true;
			}
			if (this.arrow.rotation < -2.5) {
				this.arrowRotateLeft = false;
			}

			if (this.arrowRotateLeft) {
				this.arrow.rotation -= 0.05;
			}
			else {
				this.arrow.rotation += 0.05;
			}
		},

    shakeCamera: function() {
    	// return;
      // if (this.stopShake) {
      //   return;
      // }
      var x = Math.floor((Math.random() * 10) - 5);
      var y = Math.floor((Math.random() * 10) - 5);
      var time = Math.floor((Math.random() * 30) + 20);
      var xPos = "+=" + x;
      var yPos = "+=" + y;
      $('canvas').animate({left: xPos, top: yPos}, time, 'easeOutCubic', function() {
        var x = Math.floor((Math.random() * 10) - 5);
        var y = Math.floor((Math.random() * 10) - 5);
        var time = Math.floor((Math.random() * 30) + 20);
        var xPos = "+=" + x;
        var yPos = "+=" + y;
        $('canvas').animate({left: xPos, top: xPos}, time, 'easeInOutCubic', function() {
          var x = Math.floor((Math.random() * 10) - 5);
          var y = Math.floor((Math.random() * 10) - 5);
          var time = Math.floor((Math.random() * 30) + 20);
          var xPos = "+=" + x;
          var yPos = "+=" + y;
          $('canvas').animate({left: xPos, top: xPos}, time, 'easeInOutCubic', function() {
            var x = Math.floor((Math.random() * 10) - 5);
            var y = Math.floor((Math.random() * 10) - 5);
            var time = Math.floor((Math.random() * 30) + 20);
            var xPos = "+=" + x;
            var yPos = "+=" + y;
            $('canvas').animate({left: 0, top: 0}, time, 'easeInOutCubic', function() {
            });
            // shakeCamera();
          });
        });
      });
    },

		// start game - release ball
    onInputDown: function () {
			if (this.ballIsReset && this.isGameOver != true) {
				var numBalls = this.ballsGrp.children.length;
				this.ballsGrp.children[numBalls-1].body.velocity.setTo(this.initBallVel);
				this.game.physics.arcade.velocityFromAngle(this.arrow.angle, VEL_MIN, this.ballsGrp.children[0].body.velocity);
				this.arrow.visible = false;
				this.ballIsReset = false;
			}

			this.ship.x = this.game.input.x;

      // this.game.state.start('menu');
			// this.game.scale.startFullScreen();
      // if (this.game.scale.isFullScreen) { this.game.scale.stopFullScreen(); } else { this.game.scale.startFullScreen();}
    }
  };

  window['yophaser'] = window['yophaser'] || {};
  window['yophaser'].Game = Game;
}());

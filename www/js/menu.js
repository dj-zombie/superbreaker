var newGame, back, easy, medium, hard, video, videoSprite, levelSelect, button, level = [];
var videoPlayed = false;
var menuMusic;

(function() {
  'use strict';

  function Menu() {}

  Menu.prototype = {
    create: function () {
			var scaleWidth = this.game.scale.bounds.width / 600;
			var scaleHeight = this.game.scale.bounds.height / 800;
			var fontStyle = {font: '48px Haettenschweiler', fill: '#ffffff', align: 'center'};
			var menuGroup = this.game.add.group();

			// Audio
			this.game.sound.stopAll();
			var moveSnd = this.add.audio('ui-move');
			moveSnd.volume = 0.9;
			// Music
			if (localStorage.getItem('music') == 'on' || localStorage.getItem('music') == undefined) {
				menuMusic = this.add.audio('ui-music');
				this.game.sound.stopAll();
				menuMusic.volume = 0.4;
				menuMusic.loop = true;
				menuMusic.play();
			}


			if ($('#pause-btn') != undefined) {
				$('#pause-btn').css('display','none');
			}
			if ($('#pause-container') != undefined) {
				$('#pause-container').css('display', 'none');
			}

			// Background
			var bg = this.game.add.sprite(this.game.world.centerX, this.game.world.centerY, 'menu-background');
			bg.anchor.set(0.5);
			bg.scale.set(scaleWidth, scaleHeight);

			// Logo
			var logo = this.game.add.sprite(this.game.world.centerX, -100, 'menu-logo');
			logo.anchor.set(0.5);
			logo.scale.set(scaleWidth - 0.05);
			var logoTween = this.game.add.tween(logo).to({
				y: this.game.world.centerY / 4
			}, 1300, Phaser.Easing.Bounce.Out, true);

			// Menu Text
			// New Game
			var newGame = this.game.add.sprite(this.game.width * 0.5, this.game.height * 0.5 + 50, 'menu-newgame');
			newGame.alpha = 0;
			var newGameTween = this.game.add.tween(newGame).to({
				y: this.game.height * 0.5,
				alpha: 1
			}, 500, Phaser.Easing.Linear.In, true);
			menuGroup.create(this.game.width * 0.5, this.game.height * 0.5 + 20, 'menu-newgame');
			newGame.anchor.set(0.5);
			newGame.inputEnabled = true;


      // Instructions
			var instructionsTxt = this.game.add.sprite(this.game.width * 0.5, this.game.height * 0.5 + 120, 'menu-instructions');
			instructionsTxt.alpha = 0;
			var instructionsTween = this.game.add.tween(instructionsTxt).to({
				y: this.game.height * 0.5 + 60,
				alpha: 1
			}, 550, Phaser.Easing.Linear.In, true);
			instructionsTxt.anchor.set(0.5);
			instructionsTxt.inputEnabled = true;
			instructionsTxt.events.onInputUp.add(function() {
        $('#instructions-dialog').fadeIn();
				moveSnd.play();
			}, this);


      // Credits
			var creditsTxt = this.game.add.sprite(this.game.width * 0.5, this.game.height * 0.5 + 120, 'menu-credits');
			creditsTxt.alpha = 0;
			var creditsTween = this.game.add.tween(creditsTxt).to({
				y: this.game.height * 0.5 + 120,
				alpha: 1
			}, 650, Phaser.Easing.Linear.In, true);
			creditsTxt.anchor.set(0.5);
			creditsTxt.inputEnabled = true;
			creditsTxt.events.onInputUp.add(function() {
        $('#credits-dialog').fadeIn();
				moveSnd.play();
			}, this);


//			// Exit
//			var exitTxt = this.game.add.sprite(this.game.width * 0.5, this.game.height * 0.5 + 120, 'menu-exit');
//			exitTxt.alpha = 0;
//			var exitTween = this.game.add.tween(exitTxt).to({
//				y: this.game.height * 0.5 + 180,
//				alpha: 1
//			}, 550, Phaser.Easing.Linear.In, true);
//			exitTxt.anchor.set(0.5);
//			exitTxt.inputEnabled = true;
//			exitTxt.events.onInputUp.add(function() {
//				moveSnd.play();
//				navigator.app.exitApp();
//			}, this);

			// if (videoPlayed == false) {
				//video = this.game.add.video('chrome');
				//var vscaleWidth = this.game.scale.bounds.width / 600;
				//var vscaleHeight = this.game.scale.bounds.height / 600;
				//videoSprite = video.addToWorld(this.game.world.centerX, this.game.world.centerY, 0.5, 0.5, 2,2);
				//videoSprite.angle = -90;
				//video.play();
			// }


			newGame.events.onInputUp.add(function() {
				this.game.input.onDown.removeAll();
				var menuTween = this.game.add.tween(newGame).to({
					x: -400
				}, 1000, Phaser.Easing.Bounce.Out, true);
//				var menuTween = this.game.add.tween(exitTxt).to({
//					x: -100
//				}, 800, Phaser.Easing.Bounce.Out, true);
        var menuTween = this.game.add.tween(instructionsTxt).to({
					x: -400
				}, 400, Phaser.Easing.Bounce.Out, true);
        var menuTween = this.game.add.tween(creditsTxt).to({
					x: -400
				}, 200, Phaser.Easing.Bounce.Out, true);

				moveSnd.play();

				// Easy
				easy = this.game.add.sprite(this.game.width + 200, this.game.height * 0.5, 'menu-easy');
				menuTween = this.game.add.tween(easy).to({
					x: this.game.width * 0.5
				}, 1000, Phaser.Easing.Bounce.Out, true);
	      easy.anchor.set(0.5);
				easy.inputEnabled = true;
				// Easy Input
				easy.events.onInputUp.add(function() {
					this.game.input.onDown.removeAll();
					moveSnd.play();
					localStorage.setItem('difficulty', 'easy');
					this.levelSelect();
				}, this);

				// Medium
				medium = this.game.add.sprite(this.game.width + 200, this.game.height * 0.5 + 60, 'menu-medium');
				menuTween = this.game.add.tween(medium).to({
					x: this.game.width * 0.5
				}, 1050, Phaser.Easing.Bounce.Out, true);
	      medium.anchor.set(0.5);
				medium.inputEnabled = true;
				medium.events.onInputUp.add(function() {
					this.game.input.onDown.removeAll();
					moveSnd.play();
					localStorage.setItem('difficulty', 'normal');
					this.levelSelect();
				}, this);

				// Hard
				hard = this.game.add.sprite(this.game.width + 200, this.game.height * 0.5 + 120, 'menu-hard');
				menuTween = this.game.add.tween(hard).to({
					x: this.game.width * 0.5
				}, 1100, Phaser.Easing.Bounce.Out, true);
	      hard.anchor.set(0.5);
				hard.inputEnabled = true;
				hard.events.onInputUp.add(function() {
					this.game.input.onDown.removeAll();
					moveSnd.play();
					localStorage.setItem('difficulty', 'hard');
					this.levelSelect();
				}, this);

			}, this);
    },

		levelSelect: function() {
			var menuTween = this.game.add.tween(easy).to({
				x: -400
			}, 1000, Phaser.Easing.Bounce.Out, true);
			menuTween = this.game.add.tween(medium).to({
				x: -400
			}, 1300, Phaser.Easing.Bounce.Out, true);
			menuTween = this.game.add.tween(hard).to({
				x: -400
			}, 1300, Phaser.Easing.Bounce.Out, true);

			// Level select
			levelSelect = this.game.add.sprite(this.game.width + 200, this.game.height / 3 - 40, 'menu-levelselect');
			levelSelect.anchor.set(0.5);
			menuTween = this.game.add.tween(levelSelect).to({
				x: this.game.width * 0.5
			}, 1000, Phaser.Easing.Bounce.Out, true);

			setTimeout(function() {
				$('#level-select').css('display', 'block');
				$('#level-select').addClass('animated bounceInRight');
			}, 10);

			// localStorage.setItem('first-start', true);

			// create level grid
			var numLevels = 20;

			// First time starting game
			if (localStorage.getItem('first-start') === null || JSON.parse(localStorage.getItem('first-start'))) {
				// console.log('--- First Start ---');
				localStorage.setItem('first-start', false);
				var levels = [
					{'unlocked': true, 'stars': 0}, // first item in list
				];

				for (var i=1; i < numLevels + 1; i++) {
					var obj = {'unlocked': true, 'stars': 0};

					levels.push(obj);
				}
				localStorage.setItem('levels', JSON.stringify(levels));

				localStorage.setItem('coins', '0');
				localStorage.setItem('magnet', 1);
				localStorage.setItem('magnet-duration', 600);
				localStorage.setItem('magnet-charges', 1)
				localStorage.setItem('fireball', 1);
				localStorage.setItem('fireball-duration', 600);
				localStorage.setItem('laser', 1);
				localStorage.setItem('ads', 1);
				localStorage.setItem('loadLevel', 1);
				localStorage.setItem('music', 'true');
			}

			// get our level info
			var localData = JSON.parse(localStorage.getItem('levels'));
			// empty any previous appended levels
			$('.level-row').html('');

			// Loop through levels and add each to row
			for (var i=1; i < numLevels +1; i++) {
				var lockedTemplate =
				'<div id="level--' + i + '" class="level locked"> \
					<h2>' + i + '</h2> \
					<img class="lock" src="assets/menu/lock.png"> \
				</div><!-- end .level -->';

				var levelTemplate;
				var oneStar =
				'<div id="level--' + i + '" data-level="' + i + '" class="level"> \
					<h2>' + i + '</h2> \
					<div class="level-stars"> \
						<img src="assets/menu/star.png"> \
						<img src="assets/menu/star-bw.png"> \
						<img src="assets/menu/star-bw.png"> \
					</div><!-- end .level-stars --> \
				</div><!-- end .level -->';

				var twoStar =
				'<div id="level--' + i + '" data-level="' + i + '" class="level"> \
					<h2>' + i + '</h2> \
					<div class="level-stars"> \
						<img src="assets/menu/star.png"> \
						<img src="assets/menu/star.png"> \
						<img src="assets/menu/star-bw.png"> \
					</div><!-- end .level-stars --> \
				</div><!-- end .level -->';

				var threeStar =
				'<div id="level--' + i + '" data-level="' + i + '" class="level"> \
					<h2>' + i + '</h2> \
					<div class="level-stars"> \
						<img src="assets/menu/star.png"> \
						<img src="assets/menu/star.png"> \
						<img src="assets/menu/star.png"> \
					</div><!-- end .level-stars --> \
				</div><!-- end .level -->';

				var noStar =
				'<div id="level--' + i + '" data-level="' + i + '" class="level"> \
					<h2>' + i + '</h2> \
					<div class="level-stars"> \
						<img src="assets/menu/star-bw.png"> \
						<img src="assets/menu/star-bw.png"> \
						<img src="assets/menu/star-bw.png"> \
					</div><!-- end .level-stars --> \
				</div><!-- end .level -->';

				var numStars = parseInt(localData[i-1].stars);

				if (numStars == 1) {
					levelTemplate = oneStar;
				}
				else if (numStars == 2) {
					levelTemplate = twoStar;
				}
				else if (numStars == 3) {
					levelTemplate = threeStar;
				}
				else {
					levelTemplate = noStar;
				}

				if (localData[i-1].unlocked) {
					$('.level-row').append(levelTemplate);
				}
				else {
					$('.level-row').append(lockedTemplate);
				}
			}// end for levels

			var self = this;
			for (var i=1; i < numLevels + 1; i++) {

				$('#level--' + i).one('click', function(e) {
					if ($(this).attr('data-level')) {
						localStorage.loadLevel = $(this).attr('data-level');
						// $('#yophaser-game').fadeOut(800);
						$('#level-select').fadeOut(800);
            self.game.sound.stopAll();
						var selectSnd = self.game.add.audio('ui-select');
						selectSnd.volume = 0.9;
						selectSnd.play();
            // menuMusic.stop();


						setTimeout(function() {
              if (localStorage.loadLevel == 1) {
                $('#instructions-dialog').fadeIn();
              }
							// $('#yophaser-game').fadeIn(2000);
							self.game.state.start('game');
						},1100);

					}
					else {
						$('#locked-dialog').fadeIn();
					}
				});
			}
		},

		updateVideo: function() {
			if (video.playing == false) {
				videoSprite.destroy();
				video.destroy();
				videoPlayed = false;

				var self = this;
				setTimeout(function() {
					// Music
					if (localStorage.getItem('music') == 'on' || localStorage.getItem('music') == undefined) {
						var menuMusic = self.add.audio('ui-music');
						self.game.sound.stopAll();
						menuMusic.volume = 0.4;
						menuMusic.loop = true;
						menuMusic.play();
					}
				}, 2000);
			}
		},

    update: function () {
			// this.updateVideo();
    },
  };

  window['yophaser'] = window['yophaser'] || {};
  window['yophaser'].Menu = Menu;
}());

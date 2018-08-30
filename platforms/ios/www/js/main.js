// $(document).ready(function() {
var ps = Phaser.ParticleStorm;
window.addEventListener('load', function () {
  'use strict';

  var ns = window['yophaser'];
  var width = window.innerWidth * window.devicePixelRatio;
  var height = window.innerHeight * window.devicePixelRatio;
  var game = new Phaser.Game(window.innerWidth, window.innerHeight, Phaser.CANVAS, 'yophaser-game'); //yophaser-game
	var scaleRatio = window.devicePixelRatio / 3;	
  game.state.add('boot', ns.Boot);
  game.state.add('preloader', ns.Preloader);
  game.state.add('menu', ns.Menu);
  game.state.add('game', ns.Game);
  /* yo phaser:state new-state-files-put-here */
  game.state.start('boot');
}, false);

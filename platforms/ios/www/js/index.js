/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

function initializeStore() {
	
	if (!window.store) {
		log('Store not available');
    return;
  }

    // Let's set a pretty high verbosity level, so that we see a lot of stuff
    // in the console (reassuring us that something is happening).
    store.verbosity = store.INFO;

    // We register a dummy product. It's ok, it shouldn't
    // prevent the store "ready" event from firing.
    store.register({
        id:    "no_ads",
        alias: "Remove Advertisements",
        type:  store.CONSUMABLE
    });
		store.register({
        id:    "bag_of_coins",
        alias: "Bag of 300 coins",
        type:  store.CONSUMABLE
    });

    // When every goes as expected, it's time to celebrate!
    // The "ready" event should be welcomed with music and fireworks,
    // go ask your boss about it! (just in case)
    store.ready(function() {
        console.log("\\o/ STORE READY \\o/");
    });

    // After we've done our setup, we tell the store to do
    // it's first refresh. Nothing will happen if we do not call store.refresh()
    store.refresh();

		// Log all errors
		store.error(function(error) {
			console.log('ERROR ' + error.code + ': ' + error.message);
		});

		store.when("Remove Advertisements").approved(function (order) {
			localStorage.setItem('ads', 0);
			$('#ads-dialog').fadeIn();
			self.coinSnd.play();
			order.finish();
			var coinsInv = localStorage.getItem('coins');
			$('#coins-inv').text(coinsInv);
		});
		store.when("Bag of 300 coins").approved(function (order) {
			var currentCoins = parseInt(localStorage.getItem('coins'));
			var newCoins = currentCoins + 300;
			localStorage.setItem('coins', newCoins);
			self.coinSnd.play();
			$('#rich-dialog').fadeIn();
			order.finish();
			var coinsInv = localStorage.getItem('coins');
			$('#coins-inv').text(coinsInv);
		});
}


var app = {
    initialize: function() {
        this.bindEvents();
    },
    bindEvents: function() {
        document.addEventListener('deviceready', this.onDeviceReady, false);
    },
    onDeviceReady: function() {
        initializeStore();
    },
};

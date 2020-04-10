/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

'use strict';

var express = require('express'); // app server
var bodyParser = require('body-parser'); // parser for post requests
var AssistantV1 = require('watson-developer-cloud/assistant/v1');
var ToneAnalyzerV3 = require('watson-developer-cloud/tone-analyzer/v3');

var toneDetection = require('./addons/tone_detection.js'); // required for tone detection
var maintainToneHistory = false;


var app = express();
app.use(express.static('./public')); // load UI from public folder
app.use(bodyParser.json());

// Bootstrap application settings
// Instantiate the Watson AssistantV1 Service as per WDC 2.2.0
var assistant = new AssistantV1({
  version: '2017-05-26'
});

// Instantiate the Watson Tone Analyzer Service as per WDC 2.2.0
var toneAnalyzer = new ToneAnalyzerV3({
  version: '2016-05-19'
});

// Endpoint to be called from the client side
app.post('/api/message', function(req, res) {
  var workspace = process.env.WORKSPACE_ID || '<workspace-id>';
  if (!workspace || workspace === '<workspace-id>') {
    return res.json({
      'output': {
        'text': 'The Workspace is not valid.'
      }
    });
  }
  var payload = {
    workspace_id: workspace,
    context: {},
    input: {}
  };

  if (req.body) {
    if (req.body.input) {
      payload.input = req.body.input;
    }
    if (req.body.context) {
      payload.context = req.body.context;
    } else {

      // Add the user object (containing tone) to the context object for
      // Assistant
      payload.context = toneDetection.initUser();
    }


    // Invoke the tone-aware call to the Assistant Service
    invokeToneConversation(payload, res);
  }
});

/**
 * Updates the response text using the intent confidence
 *
 * @param {Object}
 *                input The request to the Assistant service
 * @param {Object}
 *                response The response from the Assistant service
 * @return {Object} The response with the updated message
 */
function updateMessage(input, response) {
  var responseText = null;
  var id = null;

  if (!response.output) {
    response.output = {};
  } else {

    return response;
  }

  if (response.intents && response.intents[0]) {
    var intent = response.intents[0];
    // Depending on the confidence of the response the app can return different
    // messages.
    // The confidence will vary depending on how well the system is trained. The
    // service will always try to assign
    // a class/intent to the input. If the confidence is low, then it suggests
    // the service is unsure of the
    // user's intent . In these cases it is usually best to return a
    // disambiguation message
    // ('I did not understand your intent, please rephrase your question',
    // etc..)
    if (intent.confidence >= 0.75) {
      responseText = 'I understood your intent was ' + intent.intent;
    } else if (intent.confidence >= 0.5) {
      responseText = 'I think your intent was ' + intent.intent;
    } else {
      responseText = 'I did not understand your intent';
    }
  }
  response.output.text = responseText;

  return response;
}

/**
 * 
 * @returns {Object} return response from Assistant service
 *          invokeToneConversation calls the invokeToneAsync function to get the
 *          tone information for the user's input text (input.text in the
 *          payload json object), adds/updates the user's tone in the payload's
 *          context, and sends the payload to the Assistant service to get a
 *          response which is printed to screen.
 * @param {Json}
 *                payload a json object containing the basic information needed
 *                to converse with the Assistant Service's message endpoint.
 * @param {Object}
 *                res response object
 *
 */
function invokeToneConversation(payload, res) {
  toneDetection.invokeToneAsync(payload, toneAnalyzer).then(function(tone) {
    toneDetection.updateUserTone(payload, tone, maintainToneHistory);
    assistant.message(payload, function(err, data) {
      var returnObject = null;
      if (err) {
        console.error(JSON.stringify(err, null, 2));
        returnObject = res.status(err.code || 500).json(err);
      } else {
        returnObject = res.json(updateMessage(payload, data));
      }
      return returnObject;
    });
  }).catch(function(err) {
    console.log(JSON.stringify(err, null, 2));
  });
}

module.exports = app;

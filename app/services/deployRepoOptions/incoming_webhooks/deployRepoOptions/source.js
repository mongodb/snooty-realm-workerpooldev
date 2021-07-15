exports = async function(payload, response) {
  // http service
  const httpService = context.services.get("slackHTTPService");

  // verify slack auth
  var slackAuth = context.functions.execute("validateSlackAPICall", payload);
  if (!slackAuth || slackAuth.status !== 'success') {
    return slackAuth;
  }

  // get repo options for this user from slack and send over
  var entitlement = await context.functions.execute("getUserEntitlements", payload);
  if (!entitlement || entitlement.status !== 'success') {
    return 'ERROR: you are not entitled to deploy any docs repos';
  }
  const userRepos = entitlement.repos.sort()
  // modify list for slack dropdown
  const repos = [];
  for (let i = 0; i < userRepos.length; i++) {

    const thisRepo = userRepos[i];
    const [repoOwner, repoName] = thisRepo.split('/');
    
    const db_name = context.values.get("db_name");
    const coll_name = "repos_branches"
    
    var repoCollection = context.services.get("mongodb-atlas").db(db_name).collection(coll_name);
    
    //this is the line to debug!!
    const repo = await repoCollection.findOne({"repoName":repoName});
    const branches = repo ? repo["branches"] : []

    // construct option for slack
    branches.forEach(branch => { 
      if (branch['buildsWithSnooty'] === false) { return; }
      const fullBranchPath = `${repoOwner}/${repoName}/${branch["gitBranchName"]}`
      
      var opt = {
        "text": {
          "type": "plain_text",
          "text": fullBranchPath,
        },
        "value": fullBranchPath
      };
      repos.push(opt);
    }); 

  }

  const block = {
    "trigger_id": payload.query.trigger_id,
  	"view": {
  	  "type": "modal",
    	"title": {
    		"type": "plain_text",
    		"text": "Deploy Docs",
    		"emoji": true
    	},
    	"submit": {
    		"type": "plain_text",
    		"text": "Submit",
    		"emoji": true
    	},
    	"close": {
    		"type": "plain_text",
    		"text": "Cancel",
    		"emoji": true
    	},
    	"blocks": [
    		{
    			"type": "input",
    			"block_id": "block_repo_option",
    			"element": {
    				"type": "multi_static_select",
    				"action_id": "repo_option",
    				"placeholder": {
    					"type": "plain_text",
    					"text": "Select a repo to deploy",
    					"emoji": true
    				},
    				"options": repos,
    			},
    			"label": {
    				"type": "plain_text",
    				"text": "Select Repo",
    				"emoji": true
    			}
    		},
    		{
    			"type": "input",
    			"block_id": "block_hash_option",
    			"element": {
    				"type": "plain_text_input",
    				"action_id": "hash_option",
    				"placeholder": {
    					"type": "plain_text",
    					"text": "Enter a commit hash (defaults to latest master commit)"
    				}
    			},
    			"optional": true,
    			"label": {
    				"type": "plain_text",
    				"text": "Commit Hash"
    			}
    		}
    	]
  	}
  };
  
  const http = context.services.get("slackHTTPService");
  const token = context.values.get("slack_bot_oauth_token");
  
  // post to slack to open modal
  // https://api.slack.com/surfaces/modals/using#opening_modals
  return http.post({
    url: "https://slack.com/api/views.open",
    headers: {
      "Authorization": [
        `Bearer ${token}`
      ]
    },
    body: block,
    encodeBodyAsJSON: true
  })
  .then(response => {
    // The response body is encoded as raw BSON.Binary. Parse it to JSON.
    const ejson_body = EJSON.parse(response.body.text());
    console.log('modal opening', JSON.stringify(ejson_body));
    return 'opening modal';
  })
  
};
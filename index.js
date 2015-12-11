var JiraApi = require('jira').JiraApi,
    _ = require('lodash');

var globalPickResults = {
    'id': 'id',
    'self': 'self',
    'description': 'description',
    'lead': 'lead.name',
    'issueTypes': 'issueTypes',
    'component': {
        keyName: 'components',
        fields: ['name']
    },
    'component_description': {
        keyName: 'components',
        fields: ['description']
    }
};

module.exports = {

    /**
     * Return auth object.
     *
     *
     * @param dexter
     * @returns {*}
     */
    authParams: function (dexter) {
        var auth = {
            protocol: dexter.environment('jira_protocol', 'https'),
            host: dexter.environment('jira_host'),
            port: dexter.environment('jira_port', 443),
            user: dexter.environment('jira_user'),
            password: dexter.environment('jira_password'),
            apiVers: dexter.environment('jira_apiVers', '2')
        };

        if (!dexter.environment('jira_host') || !dexter.environment('jira_user') || !dexter.environment('jira_password')) {

            this.fail('A [jira_protocol, jira_port, jira_apiVers, *jira_host, *jira_user, *jira_password] environment has this module (* - required).');

            return false;
        } else {

            return auth;
        }
    },

    /**
     * Return pick result.
     *
     * @param output
     * @param pickTemplate
     * @returns {*}
     */
    pickResult: function (output, pickTemplate) {

        var result = _.isArray(pickTemplate)? [] : {};
        // map template keys
        _.map(pickTemplate, function (templateValue, templateKey) {

            var outputValueByKey = _.get(output, templateValue.keyName || templateValue, undefined);

            if (_.isUndefined(outputValueByKey)) {

                result = _.isEmpty(result)? undefined : result;
                return;
            }

            // if template key is object - transform, else just save
            if (_.isArray(pickTemplate)) {

                result = outputValueByKey;
            } else if (_.isObject(templateValue)) {
                // if data is array - map and transform, else once transform
                if (_.isArray(outputValueByKey)) {
                    var mapPickArrays = this._mapPickArrays(outputValueByKey, templateKey, templateValue);

                    result = _.isEmpty(result)? mapPickArrays : _.merge(result, mapPickArrays);
                } else {

                    result[templateKey] = this.pickResult(outputValueByKey, templateValue.fields);
                }
            } else {

                _.set(result, templateKey, outputValueByKey);
            }
        }, this);

        return result;
    },

    /**
     * System func for pickResult.
     *
     * @param mapValue
     * @param templateKey
     * @param templateObject
     * @returns {*}
     * @private
     */
    _mapPickArrays: function (mapValue, templateKey, templateObject) {
        var arrayResult = [],
            result = templateKey === '-'? [] : {};

        _.map(mapValue, function (inOutArrayValue) {
            var pickValue = this.pickResult(inOutArrayValue, templateObject.fields);

            if (pickValue !== undefined)
                arrayResult.push(pickValue);
        }, this);

        if (templateKey === '-') {

            result = arrayResult;
        } else {

            result[templateKey] = arrayResult;
        }

        return result;
    },

    requestBody: function (step) {
        var mapInputs = ['name', 'description', 'categoryId', 'url', 'lead'],
            body = {};

        mapInputs.forEach(function (attrName) {
            var attrValue = step.input(attrName).first();

            if (attrValue)
                body[attrName] = attrValue;
        });

        return body;
    },

    processStatus: function (error, response, body) {

        if (error) {

            this.fail(error);
        } else if (response.statusCode === 400) {

            this.fail("400: Returned if the request is not valid and the project could not be updated.");
        }else if (response.statusCode === 401) {

            this.fail("401: Returned if the user is not logged in.");
        }else if (response.statusCode === 403) {

            this.fail("403: Returned if the user does not have rights to update projects.");
        }else if (response.statusCode === 404) {

            this.fail("404: Returned if the project does not exist.");
        } else if (response.statusCode === 201) {

            this.complete(this.pickResult(body, globalPickResults));
        } else {

            this.fail(response.statusCode + ': Something happened.');
        }
    },

    /**
     * The main entry point for the Dexter module
     *
     * @param {AppStep} step Accessor for the configuration for the step using this module.  Use step.input('{key}') to retrieve input data.
     * @param {AppData} dexter Container for all data used in this workflow.
     */
    run: function(step, dexter) {
        var projectIdOrKey = step.input('projectIdOrKey').first();
        var expand = step.input('expand').first();

        var auth = this.authParams(dexter);
        var requestBody = this.requestBody(step);

        if (!auth)
            return;

        if (!projectIdOrKey) {

            this.fail('A [projectIdOrKey] need for this module.');
            return;
        }
        
        var jira = new JiraApi(auth.protocol, auth.host, auth.port, auth.user, auth.password, auth.apiVers);

        var makeUri = '/project/' + projectIdOrKey;

        if (expand)
            makeUri = makeUri + '?expand=' + expand;

        var options = {
            rejectUnauthorized: jira.strictSSL,
            uri: jira.makeUri(makeUri),
            body: requestBody,
            method: 'PUT',
            followAllRedirects: true,
            json: true
        };

        jira.doRequest(options, function(error, response, body) {

            this.processStatus(error, response, body);
        }.bind(this));
    }
};

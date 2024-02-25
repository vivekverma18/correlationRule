/**
 * IMPORTANT NOTICE:
 * This script is AUTO-GENERATED from Tag Based Alert Clustering Definition: '\"Site De-duplication 1\"' with sys_id: c28b525d1b684e94852fdd36b04bcbd2 from domain global sys_domain: global and overrides:  sys_overrides: null
 * /sn_em_tbac_alert_clustering_definitions.do?sys_id=c28b525d1b684e94852fdd36b04bcbd2
 *
 * !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
 * !!! ANY MANUAL MODIFICATION TO THIS SCRIPT MAY BE OVERRIDDEN !!!
 * !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
 */
(function findCorrelatedAlerts(currentAlert) {
  try {
    if (!currentAlert || !(currentAlert instanceof GlideRecord)) {
      throw "currentAlert argument is missing or invalid";
    }
    if (!currentAlert.getValue("initial_remote_time")) {
      throw (
        "currentAlert with sys_id:" +
        currentAlert.getUniqueValue() +
        " and number " +
        currentAlert.getValue("number") +
        ' does not have a value for its "initial_remote_time" field.'
      );
    }
    var t = {
      start: Date.now(), // Measure milliseconds (ms) at the beginning of the script.
    };

    var acrUtils;
    if (typeof EvtMgmtAlertCorrelationRulesUtils != "undefined") {
      acrUtils = new EvtMgmtAlertCorrelationRulesUtils();
    }

    var tagBasedComparators = new sn_em_tbac.EvtMgmtTagBasedComparators();
    // Check whether the property of case sensitivity is set. It's true by default, which means the filter of the alert is case sensitive.
    var isCorrelationCaseSensitive = gs.getProperty(
      "sa_analytics.correlation_case_sensitive",
      "true"
    );

    var alertManager = new SNC.AlertManager();

    // acrScriptDebug collects debug information that will be logged if the value of the property 'evt_mgmt.sn_em_tbac.log_acr_script_debugging' is set to true.
    var acrScriptDebug =
      '"sa_analytics.correlation_case_sensitive" property is set to: ' +
      isCorrelationCaseSensitive +
      "\n\n";
    acrScriptDebug +=
      'Alert correlation rule debug information for definition [code]<a href="sn_em_tbac_alert_clustering_definitions.do?sys_id=c28b525d1b684e94852fdd36b04bcbd2" target="_blank">"Site De-duplication 1" (sys_id: c28b525d1b684e94852fdd36b04bcbd2)</a>[/code] from domain global (sys_domain: global):\n';
    acrScriptDebug += "Clustering timeframe is: 10 minutes (600000 ms).\n";
    acrScriptDebug +=
      '\nExamined (created or reopened) alert: [code]<a href="em_alert.do?sys_id=' +
      currentAlert.getUniqueValue() +
      '" target="_blank">' +
      currentAlert.getValue("number") +
      ", sys_id: " +
      currentAlert.getUniqueValue() +
      "</a>[/code].\n";

    // FROM DEFINITION CONFIG - Clustering timeframe: 10 minutes (600000 ms).
    var alertsTimeDiff = new GlideDateTime(
      currentAlert.getValue("initial_remote_time")
    );
    alertsTimeDiff.subtract(600000);

    alertManager.addStep(
      "Alert correlation rule advanced script - Before alerts query"
    ); // Add slow steps before query

    // Query alerts to compare against.
    var gr = new GlideRecord("em_alert");
    gr.addNotNullQuery("initial_remote_time");
    gr.addQuery("initial_remote_time", ">=", alertsTimeDiff.getValue());
    gr.addQuery("sys_id", "!=", currentAlert.getUniqueValue());
    // FROM DEFINITION CONFIG - Encoded alert filter: cmdb_ciISNOTEMPTY.
    gr.addEncodedQuery("cmdb_ciISNOTEMPTY");

    /* ADDITIONAL QUERIES FROM TAGS */
    // Tags from the cmdb_ci source (source = cmdb_ci)
    if (
      gs.getProperty(
        "evt_mgmt.sn_em_tbac.use_cmdb_ci_tags_in_query",
        "true"
      ) === "true"
    ) {
      // Tag enrichment step: "Query" | From the tag named: "\"Exact match on Alert CI \"location\"\"", with sys_id: 430c52dd1b684e94852fdd36b04bcbab from domain: global (sys_domain: global) and overrides:  (sys_overrides: null)
      if (String(currentAlert.cmdb_ci.location)) {
        gr.addEncodedQuery(
          "cmdb_ci.locationISNOTEMPTY^cmdb_ci.location=" +
            String(currentAlert.cmdb_ci.location)
        );
      } else {
        gr.addEncodedQuery("cmdb_ci.locationISNOTEMPTY");
      }
    }

    // If virtual alerts feature is not active then use the legacy queries.
    if (!acrUtils || !acrUtils.isVirtualAlertFeatureActive()) {
      acrScriptDebug += "\nVirtual alerts for ACR feature is INACTIVE.\n\n";
      gr.addQuery("state", "IN", "Open,Reopen");
      gr.addQuery("correlation_rule_group", "IN", "0,1"); // 0 = None (potential parent) | 1 = Primary alert (parent) | 2 = Secondary
      gr.addQuery("group_source", "IN", "2,6"); // 2 = Rules-Based, 6 = None
    }
    // Else, if virtual alerts feature is active, then query the child alerts of relevant primary alerts.
    else {
      acrScriptDebug += "\nVirtual alerts for ACR feature is ACTIVE.\n\n";
      // 1. Init a shared query to be used for ungrouped alerts query and parent alerts query.
      var sharedEncodedQuery = gr.getEncodedQuery();

      // 2. Find OPEN or REOPEN ungrouped alerts
      var ungroupedAlertsGr = new GlideRecord("em_alert");
      ungroupedAlertsGr.addQuery("state", "IN", "Open,Reopen");
      ungroupedAlertsGr.addQuery("correlation_group", "0"); // 0 = None (potential parent)
      ungroupedAlertsGr.addEncodedQuery(sharedEncodedQuery); // Add the shared encoded query to the ungrouped alerts query.
      // Don't query ungroupedAlertsGr on purpose, we'd like to extract the encoded query and use it later
      acrScriptDebug +=
        "\nThe encoded query to retrieve ungrouped alerts is: \n " +
        ungroupedAlertsGr.getEncodedQuery() +
        "\n\n";

      // 3. Find virtual alerts to group to - but we can't query them directly because values in their fields change,
      // so tags comparison may fail for them.
      // Instead, find a representative secondary alert (childs) in their groups and compare the tags to it.
      var childGr;
      if (
        gs.getProperty(
          "evt_mgmt.update_agg_group_record_with_main_alert",
          "true"
        ) == "true"
      ) {
        // If the 'evt_mgmt.update_agg_group_record_with_main_alert' property is enabled, it means
        // that the group representative (main alert) can be queried directly and to be used to compare
        // against the tags, but they need to be fetched first from em_agg_group
        var creationTimeToQueryGroupsInMinutesProperty = gs.getProperty(
          "evt_mgmt.acr_groups_creation_time_to_query_from_in_minutes",
          "1440"
        ); // 1440 minutes (one day) by default
        var creationTimeToQueryGroupsInMs =
          parseInt(creationTimeToQueryGroupsInMinutesProperty, 10) * 60 * 1000; // In milliseconds
        var creationTimeToQueryGroupsGdt = new GlideDateTime();
        creationTimeToQueryGroupsGdt.subtract(creationTimeToQueryGroupsInMs);
        // Get Tag Cluster groups that were created X time ago, depending on the property value
        var aggGroupGr = new GlideRecord("em_agg_group");
        aggGroupGr.addQuery("group_status", "1"); // Active
        aggGroupGr.addQuery("source_rule", "c4bbd25d1b684e94852fdd36b04bcb17");
        aggGroupGr.addQuery("source", "11"); // Tag Cluster groups
        aggGroupGr.addNotNullQuery("main_alert_id"); // Main alerts are defined
        aggGroupGr.addQuery(
          "sys_created_on",
          ">=",
          creationTimeToQueryGroupsGdt.getValue()
        );
        aggGroupGr.orderByDesc("sys_created_on"); // Latest first
        acrScriptDebug +=
          "\nThe em_agg_group query to retrieve main alerts of tag-cluster groups is: \n " +
          aggGroupGr.getEncodedQuery() +
          "\n\n";
        aggGroupGr.query();
        var mainAlertsIds = [];
        while (aggGroupGr.next()) {
          var mainAlertId = aggGroupGr.getValue("main_alert_id");
          mainAlertsIds.push(mainAlertId);
        }
        if (mainAlertsIds.length) {
          childGr = new GlideRecord("em_alert");
          childGr.addEncodedQuery(sharedEncodedQuery); // Add the shared encoded query to the child alerts query.
          childGr.addQuery("sys_id", "IN", mainAlertsIds.join(","));
          // Don't query childGr on purpose, we'd like to extract the encoded query and use it later
        }
      } else {
        // When the 'evt_mgmt.update_agg_group_record_with_main_alert' property is disabled
        // then we must get a representative in a different way - aggregate groups and get a single alert from them.
        // GR for only OPEN parent alerts, we DON'T want to consider reopen parent alerts
        // Use GlideAggregate instead of GlideRecord for efficiency, and narrow results to a single alert within each group.
        gs.error(
          'Event Management - Tag Based Alert Clustering Engine (sn_em_tbac) -  - "[Tag Based] "Site De-duplication 1"" ERROR: Virtual alerts for correlation rules is ACTIVE but the property "evt_mgmt.update_agg_group_record_with_main_alert" is DISABLED. Grouping will not be done as expected - a workaround with GlideAggregate is needed.'
        );
      }
      acrScriptDebug +=
        "\nThe encoded query to retrieve child alerts is: \n " +
        childGr.getEncodedQuery() +
        "\n\n";
      // Init GR to use the encoded queries we have constructed, with ^NQ (NEW QUERY) relation.
      // This ^NQ relation is not achievable with a single GlideRecord without encoded queries as it doesn't have this method.
      gr = new GlideRecord("em_alert");
      if (childGr) {
        gr.addEncodedQuery(
          ungroupedAlertsGr.getEncodedQuery() +
            "^NQ" +
            childGr.getEncodedQuery()
        );
      } else {
        gr.addEncodedQuery(ungroupedAlertsGr.getEncodedQuery());
      }
    }

    // FROM DEFINITION CONFIG - Maximum number alerts to compare against is: 1000 alerts.
    gr.setLimit(1000);

    gr.orderBy("initial_remote_time");
    acrScriptDebug +=
      "\nThe encoded query to retrieve alerts to work on is: \n " +
      gr.getEncodedQuery() +
      "\n\n";
    gr.query();

    t.queryEnd = Date.now(); // Measure milliseconds (ms) after querying compared alerts.

    acrScriptDebug +=
      "\nNumber of queried alerts: " +
      gr.getRowCount() +
      ", the definition comparedAlertsLimit value is: 1000.\n";
    if (gr.getRowCount() >= 1000) {
      acrScriptDebug += "Queried alerts limit HAS BEEN REACHED.\n";
      gs.warning(
        'Event Management - Tag Based Alert Clustering Engine (sn_em_tbac) -  - "[Tag Based] "Site De-duplication 1"" alert correlation rule has reached the limit of alerts to query: 1000.'
      );
    }

    /* GROUPING LOGIC */
    // Initialize primary alert as currentAlert, may be overwritten ahead
    var primaryAlert = {
      sysId: currentAlert.getUniqueValue(),
      initialRemoteTime: currentAlert.getValue("initial_remote_time"),
      number: currentAlert.getValue("number"),
    };
    var secondaries = [];

    alertManager.addStep(
      "Alert correlation rule advanced script - After alerts query, before loop"
    ); // Add slow steps after query, before loop

    acrScriptDebug += "List of queried alerts:\n";

    // Create a GlideFilter instance to determine whether values need to be compared with case-sensitivity or not.
    var letterCaseGlideFilter = new GlideFilter(
      "cmdb_ciISNOTEMPTY",
      "filterCondition"
    );
    if (isCorrelationCaseSensitive == "false") {
      letterCaseGlideFilter.setCaseSensitive(false);
    }

    while (gr.next()) {
      if (!letterCaseGlideFilter.match(gr, true)) {
        acrScriptDebug +=
          'Skipping [code]<a href="em_alert.do?sys_id=' +
          gr.getUniqueValue() +
          '" target="_blank">' +
          gr.getValue("number") +
          "</a>[/code]";
        acrScriptDebug +=
          " " +
          "because of a case-sensitivity mismatch between the alert's values and the definition filter\n";
        continue;
      }

      acrScriptDebug +=
        '[code]<a href="em_alert.do?sys_id=' +
        gr.getUniqueValue() +
        '" target="_blank">' +
        gr.getValue("number") +
        "</a>[/code]";

      // Check if the currentAlert and the compared alert should be grouped
      // Compare currentAlert and gr alert values by tags
      // Currently, only AND operator between the tags is supported
      if (
        // Compare cmdb_ci field/key: "location" by Exact method, from tag "\"Exact match on Alert CI \"location\"\"" with sys_id: 430c52dd1b684e94852fdd36b04bcbab from domain: global (sys_domain: global)
        String(currentAlert.cmdb_ci.location) &&
        String(gr.cmdb_ci.location) &&
        tagBasedComparators.exact(
          String(currentAlert.cmdb_ci.location),
          String(gr.cmdb_ci.location)
        )
      ) {
        // Reaching here means that the alerts should be grouped.
        // Replace current primary alert if:
        // 1. The compared alert initial_remote_time is smaller,
        // 2. Or, the initial_remote_time is equal, but the alert Number is smaller, as fallback.
        var isEarlier =
          gr.getValue("initial_remote_time") < primaryAlert.initialRemoteTime;
        var isSameTimeButSmallerNumber =
          gr.getValue("initial_remote_time") ==
            primaryAlert.initialRemoteTime &&
          gr.getValue("number") < primaryAlert.number;
        var secondary = {
          sysId: gr.getUniqueValue(),
          initialRemoteTime: gr.getValue("initial_remote_time"),
          number: gr.getValue("number"),
        };
        if (isEarlier || isSameTimeButSmallerNumber) {
          acrScriptDebug += " - potentially primary";
          secondaries.push(primaryAlert); // Current primary alert should be replaced with compared alert, make it secondary.
          primaryAlert = secondary;
        } else {
          acrScriptDebug += " - secondary";
          secondaries.push(secondary);
        }
      } // end if
      acrScriptDebug += ","; // Separate between the alerts in the list.
    } // end while

    t.loopEnd = Date.now(); // Measure milliseconds (ms) after looping through compared alerts.

    alertManager.addStep("Alert correlation rule advanced script - After loop"); // Add slow steps after loop

    // Remove primary from secondaries, just in case it's there
    secondaries = secondaries.filter(function (secondaryAlertSysId) {
      return secondaryAlertSysId != primaryAlert.sysId;
    });

    var group = {};
    var secondariesArray = secondaries.map(function (secondary) {
      return secondary.sysId;
    });
    if (acrUtils && acrUtils.isVirtualAlertFeatureActive()) {
      group = {
        ALERTS_SYS_IDS: [primaryAlert.sysId].concat(secondariesArray),
      };
    } else {
      // Set group result
      group = {
        PRIMARY: [primaryAlert.sysId],
        SECONDARY: secondariesArray,
      };
    }

    t.end = Date.now(); // Measure milliseconds (ms) at the end of the script.

    // Log the alert correlation rule details if the debugging property is set to true.
    if (
      gs.getProperty("evt_mgmt.sn_em_tbac.log_acr_script_debugging", "false") ==
      "true"
    ) {
      var readablePrimary =
        '[code]<a href="em_alert.do?sys_id=' +
        primaryAlert.sysId +
        '" target="_blank">' +
        primaryAlert.number +
        "</a>[/code]";
      var readableSecondaries = secondaries.map(function (secondary) {
        return (
          '[code]<a href="em_alert.do?sys_id=' +
          secondary.sysId +
          '" target="_blank">' +
          secondary.number +
          "</a>[/code]"
        );
      });
      acrScriptDebug += "\n\nRESULTS:\nPrimary alert: " + readablePrimary;
      acrScriptDebug += "\nSecondary alerts: " + readableSecondaries.join(",");
      acrScriptDebug +=
        "\n\nFinal alerts group structure (final returned structure):\n" +
        JSON.stringify(group);
      acrScriptDebug += "\n\nPerformance (run time in ms):\n";
      acrScriptDebug += "Total runtime: " + (t.end - t.start) + "ms.\n";
      acrScriptDebug +=
        "Compared alerts query time: " + (t.queryEnd - t.start) + "ms.\n";
      acrScriptDebug +=
        "Loop compared alerts time: " + (t.loopEnd - t.queryEnd) + "ms.\n";
      acrScriptDebug +=
        '\nIn order to stop these debug messages - change the property "evt_mgmt.sn_em_tbac.log_acr_script_debugging" to "false".\n';
      gs.info(
        "Event Management - Tag Based Alert Clustering Engine (sn_em_tbac) - \n" +
          acrScriptDebug
      );
    }

    //The alerts will be grouped under a virtual alert, and that the primary alert will be set dynamically to the alert of the highest severity.
    return JSON.stringify(group);
  } catch (e) {
    var evtMgmtCommons = new EvtMgmtCommons();
    gs.error(
      'Event Management - Tag Based Alert Clustering Engine (sn_em_tbac) -  - "[Tag Based] "Site De-duplication 1"" An exception was thrown in alert correlation rule with sys_id: c4bbd25d1b684e94852fdd36b04bcb17 for alert with sys_id: ' +
        currentAlert.getUniqueValue() +
        ". Exception: " +
        evtMgmtCommons.getExceptionMessage(e, true)
    );
    // Returns an empty object to continue to next rules
    var group = {
      PRIMARY: [],
      SECONDARY: [],
      ALERTS_SYS_IDS: [],
    };
    return JSON.stringify(group);
  }
})(currentAlert);

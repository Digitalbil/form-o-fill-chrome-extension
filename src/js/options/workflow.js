/* global Workflows jQuery Rules Logger Utils Storage JSONF */
var workflows = [];
var wfErrors = [];

// an empty workflow
var emptyWorkflow = {
  id: 0,
  name: "new workflow",
  steps: []
};

// generate a step html
var stepHtml = function(text, hasError) {
  return '<li class="' + (hasError ? "has-error" : "") + '" data-step-name="' + text + '">' + text + '<button class="wf-delete-step">remove step</button>' + (hasError ? "<span class='has-error'>Missing rule with this name!</span>" : "") + '</li>';
};

// generate a rule
var ruleHtml = function(rule) {
  return '<option data-rule-name="' + rule.name + '" data-rule-id="' + rule.id + '">' + rule.nameClean + '</option>';
};

// Show that there are unsaved changes
var unsavedChanges = function(visible) {
  var $e = jQuery("h3 span.unsaved-changes");
  if(visible) {
    $e.show();
  } else {
    $e.hide();
  }
};

// Create a new workflow
var createWorkflow = function () {
  jQuery(".wf-name").val(emptyWorkflow.name);
  jQuery("#workfloweditor ol li").remove();
  jQuery("#workfloweditor").show().data("workflowId", 0);
  jQuery(".wf-name").trigger("focus").select();
  jQuery(".wf-all select").append("<option data-workflow-id='0' selected>new workflow (unsaved)</option>");
  unsavedChanges(true);
};

// Find a single error
var findError = function(wfId, stepName) {
  var err = wfErrors.filter(function (error) {
    return error.wfId == wfId && stepName == error.missingStepName;
  });
  return err[0];
};

// Make list of steps sortable
var bindSortable = function() {
  jQuery('#workfloweditor ol')
  .sortable("destroy")
  .sortable();
};

// fill the form with workflow data
var fillWorkflow = function(data) {
  if(!data) {
    return;
  }
  var stepsHtml = [];
  jQuery("#workfloweditor").show().data("workflowId", data.id);
  jQuery(".wf-name").val(data.name);
  jQuery.makeArray(data.steps).forEach(function dataStep(step) {
    stepsHtml.push(stepHtml(step, !!findError(data.id, step)));
  });
  jQuery("#workfloweditor ol li").remove();
  jQuery("#workfloweditor ol").html(stepsHtml.join(""));
  bindSortable();
};

// fill the ruleslist HTML
var fillRuleSelect = function(rules) {
  jQuery(".rulelist").html(rules.map(ruleHtml).join(""));
};

// Add selected rule as workflow step
var addStepToWorkflow = function() {
  var ruleName = jQuery(".rulelist option:selected").data("ruleName");
  if(typeof ruleName !== "undefined") {
    jQuery("#workfloweditor ol").append(stepHtml(ruleName));
    unsavedChanges(true);
    bindSortable();
  }
};

// load available rules and fill select field
var fillAvailableRules = function() {
  Rules.all().then(function availableRules(rules) {
    jQuery(".rulelist option").remove();
    fillRuleSelect(rules);
  });
};


// Read steps from HTML
var currentWfSteps = function() {
  return jQuery("#workfloweditor li").map(function () {
    return this.dataset.stepName;
  });
};

// Find a single workflow by id
var findWorkflowById = function(wfId) {
  wfId = parseInt(wfId, 10);
  var aWf = workflows.filter(function wfFilter(wf) {
    return wf.id === wfId;
  });

  // non found -> shouldn't happen
  if(aWf.length === 0) {
    return null;
  }
  return aWf[0];
};

// Load a single workflow into the form
var loadWorkflowById = function(wfId) {
  var aWf = findWorkflowById(wfId);

  // non found -> shouldn't happen
  if(!aWf) {
    return null;
  }

  // fill form
  Logger.info("[o/workflow.js] Loading WF #" + aWf.id + " '" + aWf.name + "'");
  fillWorkflow(aWf);
};

// Load all present workflows and fill select field
var loadWorkflows = function(selectedWfId) {
  Workflows.load().then(function loadWf(rawWorkflows) {
    // When no workflows are defined, exit early
    if(typeof rawWorkflows === "undefined") {
      return;
    }

    workflows = rawWorkflows;

    // if no selectedWfId is set select first
    if(!selectedWfId && workflows.length > 0) {
      selectedWfId = workflows[0].id;
    }
    selectedWfId = parseInt(selectedWfId, 10);

    // Fill the <select> with present workflows
    var $wfSelect = jQuery(".wf-all select");
    var optionHtml = [];
    var selected = null;

    if(rawWorkflows.length === 0) {
      optionHtml.push("<option data-workflow-id='0' class='wf-no-created'>no workflow defined</option>");
      jQuery("#workfloweditor").hide();
    } else {
      optionHtml = optionHtml.concat(rawWorkflows.map(function optionHtmlMap(wfData) {
        selected = wfData.id == selectedWfId ? "selected" : "";
        return "<option " + selected + " data-workflow-id='" + wfData.id + "'>" + wfData.name + " (#" + wfData.id + ")</option>";
      }));
    }
    $wfSelect.html(optionHtml.join());

    if(selectedWfId && selectedWfId !== 0) {
      // Load a preset workflow
      fillWorkflow(loadWorkflowById(selectedWfId));
    }
  });
};

// Save a workflow
var saveWorkflow = function() {
  var currentWfId = parseInt(jQuery("#workfloweditor").data("workflowId"), 10);

  var workflow = {
    id: currentWfId,
    name: jQuery(".wf-name").val(),
    steps: currentWfSteps()
  };

  if(currentWfId === 0) {
    // Save a brand new workflow
    workflow.id = workflows.length + 1;
    currentWfId = workflow.id;

    workflows.push(workflow);
  } else {
    // Save a modified workflow
    workflows.forEach(function wfForEach(wf, index) {
      if(wf.id === currentWfId) {
        workflows[index] = workflow;
      }
    });
  }
  Workflows.save(workflows);
  Logger.info("[o/workflow.js] Saving WF {id: " + workflow.id + "; name: " + workflow.name + "; steps#: " + workflow.steps.length + "} = " + workflows.length + " total");

  // reload workflows
  jQuery("#workfloweditor").data("workflowId", currentWfId);
  loadWorkflows(currentWfId);

  Utils.infoMsg("Workflow #" + workflow.id + " saved");
  unsavedChanges(false);
};

// Check for workflow errors
var checkForErrors = function() {

  Promise.all([Workflows.load(), Rules.all()]).then(function (wfsAndAllRules) {
    // When no workflows are defined, exit early
    if(typeof wfsAndAllRules[0] === "undefined") {
      return;
    }

    // We only need the rule names (unique)
    var ruleSteps = [];
    wfsAndAllRules[1].forEach(function (rule) {
      if(ruleSteps.indexOf(rule.name) === -1) {
        ruleSteps.push(rule.name);
      }
    });

    // Iterate over all workflows searching for missing rules
    wfsAndAllRules[0].forEach(function (workflow) {
      jQuery.makeArray(workflow.steps).forEach(function (step) {
        // Try to find the workflow step in the global step list
        if(ruleSteps.indexOf(step) === -1) {
          wfErrors.push({
            wfId: workflow.id,
            wfName: workflow.name,
            missingStepName: step
          });
        }
      });
    });

    // report errors
    if(wfErrors.length > 0) {

      // Add unique workflows
      var missingHtml = [];
      var html = "";
      wfErrors.forEach(function wfErrMap(error) {
        html = ("<li><a href='#' data-workflow-id='" + error.wfId + "'>" + error.wfName + " (#" + error.wfId + ")</a></li>");
        if(missingHtml.indexOf(html) === -1) {
          missingHtml.push(html);
        }
      });

      // Make error visible
      jQuery("ul.wf-missing-rules-wfs").html(missingHtml.join(""));
      jQuery(".notice.wf-missing-rules").show();
    }
  });
};

// delete a workflow
var deleteWorkflow = function() {
  var currentWfId = parseInt(jQuery("#workfloweditor").data("workflowId"), 10);
  var changeWfTo = null;

  // remove selected workflow from array
  workflows = workflows.filter(function delWfFilter(wf) {
    return currentWfId != wf.id;
  });

  if(workflows.length > 0) {
    // reorder
    workflows = workflows.map(function delWfMap(wf, index) {
      wf.id = index + 1;
      return wf;
    });
    changeWfTo = 1;
  }

  Workflows.save(workflows).then(loadWorkflows(changeWfTo));

  Utils.infoMsg("Workflow #" + currentWfId + " deleted");
};

// Sometimes workflows get stuck
var cancelWorkflow = function() {
  Utils.infoMsg("Killed running Workflows");
  Storage.delete(Utils.keys.runningWorkflow);
};

// export a workflow to disc
var exportWorkflows = function() {
  Storage.load(Utils.keys.workflows).then(function(workflowData) {
    workflowData = workflowData.map(function cbWfDataMap(workflow) {
      workflow.steps = jQuery.makeArray(workflow.steps);
      return workflow;
    });
    var exportJson = JSONF.stringify(workflowData);
    var now = new Date();
    var fileName = "form-o-fill-workflows-export-" + now.toISOString() + ".json";

    Utils.infoMsg("Workflows exported as '" + fileName + "'");
    Utils.download(exportJson, fileName, "application/json");
  });
};

// Import workflows from disc
var importWorkflows = function() {
  jQuery("#modalimportworkflows").show();
};

// import Workflows from file
var executeImportWorkflows = function() {
  var $warning = jQuery("#modalimportworkflows .only-json");
  $warning.hide();
  var fileToImport = document.getElementById("importfile").files[0];
  if (typeof fileToImport === "undefined" || fileToImport.type != "application/json") {
    $warning.show();
  } else {
    var reader = new FileReader();
    reader.onload = function(e) {
      var parsed = JSONF.parse(e.target.result);
      Storage.save(parsed, Utils.keys.workflows).then(function () {
        jQuery("#modalimportrules").hide();
        window.location.reload();
      });
    };

    // Read file. This calls "onload" above
    reader.readAsText(fileToImport);
  }
};

// on init
jQuery(function() {
  // Fill available rules
  fillAvailableRules();

  // Load all workflows
  loadWorkflows();

  // check for errors
  checkForErrors();

  // 'create workflow' button
  jQuery(".wf-add-wf").on("click", createWorkflow);

  // 'add to workflow' button
  jQuery(".wf-add-step").on("click", addStepToWorkflow);

  // 'remove step' buttons
  jQuery(document).on("click", ".wf-delete-step", function wfDeleteStep() {
    Utils.infoMsg("Rule removed");
    jQuery(this).parent().remove();
  });

  // Save workflow button
  jQuery(".wf-button-save").on("click", saveWorkflow);

  // Delete workflow
  jQuery(".wf-button-delete").on("click", deleteWorkflow);

  // Export workflow
  jQuery(document).on("click", ".wf-button-export", exportWorkflows);

  // Import workflow via overlay
  jQuery(".wf-button-import").on("click", importWorkflows);
  jQuery(document).on("click", "#modalimportworkflows .cmd-import-all-workflows", executeImportWorkflows);

  // Cancel a stuck workflow
  jQuery(".wf-button-cancel").on("click", cancelWorkflow);

  // select a workflow from the list
  jQuery(".wf-all select").on("change", function() {
    loadWorkflowById(jQuery(".wf-all option:checked").data("workflowId"));
  });

  // Click on a link that points to an errors in a workflow
  jQuery("ul.wf-missing-rules-wfs").on("click", "a", function () {
    loadWorkflows(this.dataset.workflowId);
  });

  // Attach to click on the workflow button
  jQuery("a[href='#workflows']").on("click", fillAvailableRules);


});

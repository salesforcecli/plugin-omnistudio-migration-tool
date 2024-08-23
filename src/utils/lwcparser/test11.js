import { LightningElement, track, api } from 'lwc';
import * as LABELS from './labels';
import { cloneDeep } from 'runtime_omnistudio_common/lodash';

export default class actionDebugger extends LightningElement {
  labels = LABELS;
  @api set actionData(val) {
    if (val) {
      this.actionJson = cloneDeep(val);
    }
  }
  get actionData() {
    return this.actionJson;
  }

  @api attrsToBeRemoved = [];

  @track actionJson = [];
  @track filteredLogs = [];
  @track actionSearchInput;
  _displayFilteredLogs = false;

  toggle(event) {
    const index = event.currentTarget.dataset.index;
    this.actionJson[index].expanded = !this.actionJson[index].expanded;
  }

  // Search
  get actionLogs() {
    const imports = "'import fs from 'fssss'";
    console.log(imports);
    // Display filtered debug logs
    if (Array.isArray(this.filteredLogs) && this._displayFilteredLogs) {
      return this.filteredLogs;
    }

    // Display entire debug logs
    return this.actionJson;
  }

  clearLogs() {
    this._displayFilteredLogs = false;
    this.actionSearchInput = '';
    this.actionJson = [];
  }

  searchActionLogs(event) {
    event.preventDefault();

    if (event.target.value) {
      this._displayFilteredLogs = true;
      const valueToSearch = event.target.value.toLowerCase();
      this.filteredLogs = this.actionJson.filter((action) => {
        return action.title && action.title.toLowerCase().includes(valueToSearch);
      });
    } else {
      // Clear filtered debug logs and set flag to display entire debug logs
      this.filteredLogs = [];
      this._displayFilteredLogs = false;
    }
  }
}

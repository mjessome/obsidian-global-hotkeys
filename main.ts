import { App, Modal, Notice, Platform, Plugin, PluginSettingTab, Setting } from 'obsidian';
const remote = require('electron').remote;
const globalShortcut = remote.globalShortcut;

interface GlobalHotkeysPluginSettings {
  accelerators: { [key: string]: string };
}

const DEFAULT_SETTINGS: GlobalHotkeysPluginSettings = {
  accelerators: {},
}

export default class GlobalHotkeysPlugin extends Plugin {
  settings: GlobalHotkeysPluginSettings;
  currentlyMapped: { [key: string]: string };

  async registerGlobalShortcut(command_id:string, accelerator:string,
                               oncomplete?:(success:boolean)=>void) {
    if (command_id in this.currentlyMapped) {
      this.unregisterGlobalShortcut(command_id);
    }

    let success = (() => {
      try {
        return globalShortcut.register(accelerator, () => {
          const command = app.commands.commands[command_id];
          if (!command) return;
          this.app.setting.close(); // Ensure all modals are closed?
          const win = remote.getCurrentWindow();
          const wasHidden = !win.isFocused() || !win.isVisible();

          if (command.checkCallback)
            command.checkCallback(false);
          else if (command.callback)
            command.callback();

          // only activate Obsidian if visibility hasn't changed
          const isHidden = !win.isFocused() || !win.isVisible();
          if (wasHidden && isHidden)
            remote.getCurrentWindow().show(); // Activate obsidian
        });
      } catch (error) {
        return false;
      }
    })();

    if (success) {
      this.currentlyMapped[command_id] = accelerator;
    }

    if (oncomplete) {
      oncomplete(success);
    }
  }

  async unregisterGlobalShortcut(command_id:string) {
    const accelerator = this.currentlyMapped[command_id];
    if (accelerator) {
      globalShortcut.unregister(accelerator);
      delete this.currentlyMapped[command_id];
    }
  }

  isRegistered(command_id:string) {
    return (command_id in this.currentlyMapped);
  }

  async onload() {
    this.currentlyMapped = {};

    this.addCommand({
      id: 'bring-to-front',
      name: 'Bring Obsidian to front',
      checkCallback: (checking: boolean) => {
        if (!checking)
          remote.getCurrentWindow().show();
        return true;
      }
    });

    this.addCommand({
      id: 'show-hide',
      name: 'Show/Hide Obsidian',
      checkCallback: (checking: boolean) => {
        if (!checking) {
          const win = remote.getCurrentWindow();
          if (win.isVisible()) {
            if (Platform.isMacOS) {
              remote.Menu.sendActionToFirstResponder('hide:');
            } else {
              win.hide();
            }
          } else {
            win.show();
          }
        }
        return true;
      }
    });

    await this.loadSettings();

    globalShortcut.unregisterAll();
    for (const cmd in this.settings.accelerators) {
      const a = this.settings.accelerators[cmd];
      if (a) {
        this.registerGlobalShortcut(cmd, a);
      }
    }

    this.addSettingTab(new GlobalShortcutSettingTab(this.app, this));
  }

  onunload() {
    globalShortcut.unregisterAll();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class GlobalShortcutSettingTab extends PluginSettingTab {
  plugin: GlobalHotkeysPlugin;
  filterString: string;
  settingElems: Setting[];

  constructor(app: App, plugin: GlobalHotkeysPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.filterString = "";
  }

  updateHotkeyVisibility() {
    this.settingElems.forEach((e) => {
      const elemName = e.nameEl.textContent.toLowerCase();
      const visible = this.filterString.length == 0 || elemName.contains(this.filterString);
      e.settingEl.toggle(visible);
    });
  }

  async removeSavedAccelerator(command_id:string) {
    this.plugin.unregisterGlobalShortcut(command_id);
    delete this.plugin.settings.accelerators[command_id];
    await this.plugin.saveSettings();
  }

  display(): void {
    let {containerEl} = this;
    this.settingElems = []

    containerEl.empty();

    containerEl.createDiv('', div => {
      const text = document.createElement('p');
      text.appendText("For information on key bindings, see documentation ");

      const link = document.createElement('a');
      link.setAttribute('href', "https://www.electronjs.org/docs/api/accelerator#available-modifiers");
      link.textContent = "here";
      text.appendChild(link);

      text.appendText(".");
      div.appendChild(text);

      const exampleText = document.createElement('p');
      exampleText.appendChild(document.createElement('strong')).appendText('Example: ');
      exampleText.appendText('Cmd+Shift+Ctrl+Alt+N');
      div.appendChild(exampleText);
    });

    containerEl.createDiv('hotkey-search-container', div => {
      let filterEl = document.createElement('input');
      div.appendChild(filterEl);
      filterEl.setAttribute('type', 'text');
      filterEl.setAttribute('placeholder', 'Filter...');
      filterEl.value = this.filterString;
      filterEl.addEventListener('input', e => {
        this.filterString = e.target.value.toLowerCase();
        this.updateHotkeyVisibility();
      });
    });

    let allCmds = this.app.commands.commands;

    const cmdKeys = Object.keys(allCmds);
    cmdKeys.sort((e1, e2) => (allCmds[e1].name < allCmds[e2].name) ? -1 : 1);
    cmdKeys.forEach(cmd => {
      const accelerator = this.plugin.settings.accelerators[cmd];
      const name = allCmds[cmd].name;
      let setting = new Setting(containerEl)
        .setName(name)
        .addText(text => text
                 .setPlaceholder('Hotkey')
                 .setValue(accelerator)
                 .onChange(async (value) => {
                   const inputEl = setting.components[0].inputEl;
                   if (value) {
                     this.plugin.registerGlobalShortcut(cmd, value, async (success) => {
                       if (success) {
                         inputEl.classList.remove('invalid-accelerator');
                         this.plugin.settings.accelerators[cmd] = value;
                         await this.plugin.saveSettings();
                       } else {
                         this.removeSavedAccelerator(cmd);
                         inputEl.classList.add('invalid-accelerator');
                       }
                     });
                   } else {
                     inputEl.classList.remove('invalid-accelerator');
                     this.removeSavedAccelerator(cmd);
                   }
                 }));
      this.settingElems.push(setting);
    });

    this.updateHotkeyVisibility();
  }
}

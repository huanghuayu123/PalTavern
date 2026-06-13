export {};
declare const require: (id: string) => any;

const appDialogs = require('../src/independent-chat/ui/app-dialogs');

let renderCount = 0;
const rerender = () => {
  renderCount += 1;
};

let confirmed = false;
appDialogs.openAppConfirm({
  title: '删除动态',
  message: '删除后可以短时间撤销。',
  confirmLabel: '删除动态',
  cancelLabel: '先不删',
  tone: 'danger',
  onConfirm: () => {
    confirmed = true;
  },
}, rerender);

const confirmHtml = appDialogs.renderAppDialog();
if (!confirmHtml.includes('role="dialog"') || !confirmHtml.includes('aria-modal="true"')) {
  throw new Error('Confirm dialog should render as an accessible modal dialog.');
}
if (!confirmHtml.includes('删除动态') || !confirmHtml.includes('先不删')) {
  throw new Error('Confirm dialog should include the supplied title and button labels.');
}
if (!confirmHtml.includes('data-app-dialog-confirm')) {
  throw new Error('Confirm dialog should expose a confirm action hook.');
}
if (renderCount !== 1) {
  throw new Error('Opening a confirm dialog should request one render.');
}

appDialogs.confirmAppDialog();
if (!confirmed) {
  throw new Error('Confirming the dialog should run the confirm callback.');
}
if (appDialogs.renderAppDialog() !== '') {
  throw new Error('Confirming the dialog should clear the active dialog.');
}

let promptValue = '';
appDialogs.openAppPrompt({
  title: '场景结束摘要',
  label: '摘要',
  initialValue: '旧摘要',
  multiline: true,
  confirmLabel: '保存摘要',
  onConfirm: (value: string) => {
    promptValue = value;
  },
}, rerender);

const promptHtml = appDialogs.renderAppDialog();
if (!promptHtml.includes('<textarea') || !promptHtml.includes('旧摘要')) {
  throw new Error('Prompt dialog should render a textarea with the initial value when multiline is true.');
}
if (!promptHtml.includes('保存摘要')) {
  throw new Error('Prompt dialog should render the supplied confirm label.');
}

appDialogs.confirmAppDialog('新的摘要');
if (promptValue !== '新的摘要') {
  throw new Error('Prompt confirm should pass the entered value to the callback.');
}

let canceled = false;
appDialogs.openAppConfirm({
  title: '删除角色',
  message: '这会删除聊天记录。',
  onConfirm: () => {
    throw new Error('Cancel should not run confirm callbacks.');
  },
  onCancel: () => {
    canceled = true;
  },
}, rerender);
appDialogs.cancelAppDialog();
if (!canceled) {
  throw new Error('Canceling the dialog should run the cancel callback.');
}
if (appDialogs.hasActiveAppDialog()) {
  throw new Error('Canceling the dialog should clear the active dialog.');
}

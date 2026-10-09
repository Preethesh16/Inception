// Keep React in charge of every translated node. No DOM mutation or event/value translation.
module.exports = function ({ types: t }) {
  const tags = new Set('a article aside b button caption dd details div dl dt em figcaption figure footer form h1 h2 h3 h4 h5 h6 header label legend li main nav ol option p section small span strong summary table tbody td th thead tr ul text tspan input textarea img select'.split(' '));
  return { visitor: {
    Program: {
      enter(path, state) {
        state.localize = !state.filename.includes('/i18n/') && state.filename.includes('/src/');
        state.usedLocalization = false;
      },
      exit(path, state) {
        if(state.usedLocalization) path.unshiftContainer('body',t.importDeclaration([t.importSpecifier(t.identifier('__LocalizedElement'),t.identifier('LocalizedElement'))],t.stringLiteral('/src/i18n/Language')));
      }
    },
    JSXElement(path,state) {
      if(!state.localize) return;
      const opening=path.node.openingElement;
      if(!t.isJSXIdentifier(opening.name) || !tags.has(opening.name.name)) return;
      const tag=opening.name.name;
      opening.name=t.jsxIdentifier('__LocalizedElement');
      opening.attributes.unshift(t.jsxAttribute(t.jsxIdentifier('as'),t.stringLiteral(tag)));
      if(path.node.closingElement) path.node.closingElement.name=t.jsxIdentifier('__LocalizedElement');
      state.usedLocalization=true;
    }
  }};
};

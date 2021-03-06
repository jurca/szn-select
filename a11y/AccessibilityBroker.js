class AccessibilityBroker {
  constructor(select, ui, sznSelect) {
    this.select = select
    this.sznSelect = sznSelect
    this.ui = ui
  }

  setOpen(isOpen) {
    this.sznSelect.isOpen = isOpen
    this.ui.setOpen(isOpen)
  }

  generateMetaAttributes(baseAttributes) {
    return baseAttributes
  }

  onMount() {}

  onUnmount() {}

  onUiClicked(event) {}

  onChange() {}
}
AccessibilityBroker.compatibilityTest = () => {
  throw new TypeError('The compatibility test is not implemented for this accessibility implementation')
}

'use strict'
;(global => {
  const SznElements = global.SznElements = global.SznElements || {}

  const CSS_STYLES = `
%{CSS_STYLES}%
  `
  const CSS_STYLES_TAG = 'data-styles--szn-select'

  const MIN_BOTTOM_SPACE = 160 // px
  const OBSERVED_DOM_EVENTS = ['resize', 'scroll', 'wheel', 'touchmove']

  let stylesInjected = false

  SznElements['szn-select'] = class SznSelect {
    constructor(rootElement, uiContainer) {
      if (!rootElement.hasOwnProperty('minBottomSpace')) {
        Object.defineProperty(rootElement, 'minBottomSpace', {
          get: () => rootElement._broker._minBottomSpace,
          set: value => {
            rootElement._broker._minBottomSpace = value
            if (rootElement._broker._dropdown && rootElement._broker._dropdown._broker) {
              this._dropdown.minBottomSpace = value
            }
          },
        })
      }

      this._root = rootElement
      this._select = rootElement.querySelector('select')
      this._uiContainer = uiContainer
      this._button = null
      this._dropdown = null
      this._dropdownPosition = null
      this._dropdownContent = SznElements.buildDom('<szn- data-szn-select-dropdown data-szn-tethered-content></szn->')
      this._dropdownOptions = null
      this._dropdownContainer = document.body
      this._blurTimeout = null
      this._minBottomSpace = MIN_BOTTOM_SPACE
      this._observer = new MutationObserver(() => onDomMutated(this))

      this._onUpdateNeeded = () => onUpdateNeeded(this)
      this._onToggleDropdown = event => onToggleDropdown(this, event)
      this._onCloseDropdown = () => onCloseDropdown(this)
      this._onFocus = () => onFocus(this)
      this._onBlur = () => onBlur(this)
      this._onKeyDown = event => onKeyDown(this, event)
      this._onDropdownPositionChange = verticalAlignment => onDropdownPositionChange(this, verticalAlignment)
      this._onDropdownSizeUpdateNeeded = () => onDropdownSizeUpdateNeeded(this)

      if (!stylesInjected) {
        const stylesContainer = document.createElement('style')
        stylesContainer.innerHTML = CSS_STYLES
        stylesContainer.setAttribute(CSS_STYLES_TAG, '')
        document.head.appendChild(stylesContainer)
        stylesInjected = true
      }

      createUI(this)
    }

    onMount() {
      let updateNeeded = false
      if (!this._uiContainer) {
        this._uiContainer = this._root.querySelector('[data-szn-select-ui]')
        updateNeeded = true
      }

      if (!this._select) {
        this._select = this._root.querySelector('select')
        updateNeeded = true
      }

      if (updateNeeded) {
        createUI(this)
      }

      addEventListeners(this)
      this._observer.observe(this._root, {
        childList: true,
        attributes: true,
        characterData: true,
        subtree: true,
        attributeFilter: ['disabled', 'multiple', 'selected'],
      })
    }

    onUnmount() {
      if (this._dropdown) {
        this._dropdown.parentNode.removeChild(this._dropdown)
      }
      if (this._blurTimeout) {
        clearTimeout(this._blurTimeout)
        this._blurTimeout = null
      }

      removeEventListeners(this)
      this._observer.disconnect()
    }
  }

  function addEventListeners(instance) {
    instance._uiContainer.addEventListener('click', instance._onToggleDropdown)
    instance._select.addEventListener('change', instance._onUpdateNeeded)
    instance._select.addEventListener('focus', instance._onFocus)
    instance._select.addEventListener('blur', instance._onBlur)
    instance._select.addEventListener('keydown', instance._onKeyDown)
    addEventListener('click', instance._onCloseDropdown)

    for (const eventType of OBSERVED_DOM_EVENTS) {
      addEventListener(eventType, instance._onDropdownSizeUpdateNeeded)
    }
  }

  function removeEventListeners(instance) {
    instance._uiContainer.removeEventListener('click', instance._onToggleDropdown)
    instance._select.removeEventListener('change', instance._onUpdateNeeded)
    instance._select.removeEventListener('focus', instance._onFocus)
    instance._select.removeEventListener('blur', instance._onBlur)
    instance._select.removeEventListener('keydown', instance._onKeyDown)
    removeEventListener('click', instance._onCloseDropdown)

    for (const eventType of OBSERVED_DOM_EVENTS) {
      removeEventListener(eventType, instance._onDropdownSizeUpdateNeeded)
    }
  }

  function onDomMutated(instance) {
    // Since we are mutating our subtree, there will be false positives, so we always need to check what has changed

    const select = instance._select
    if ((select.multiple && instance._button) || (!select.multiple && !instance._button)) {
      createUI(instance)
    }
  }

  function onDropdownSizeUpdateNeeded(instance) {
    if (!instance._dropdown || !instance._dropdown._broker || !instance._dropdownOptions._broker) {
      return
    }

    const contentHeight = instance._dropdownOptions.scrollHeight
    const dropdownStyle = getComputedStyle(instance._dropdownOptions)
    const maxHeight = (
      contentHeight + parseInt(dropdownStyle.borderTopWidth, 10) + parseInt(dropdownStyle.borderBottomWidth, 10)
    )
    const dropdownBounds = instance._dropdownContent.getBoundingClientRect()
    const isTopAligned = instance._dropdown.verticalAlignment === instance._dropdown.VERTICAL_ALIGN.TOP
    const viewportHeight = window.innerHeight

    const suggestedHeight = isTopAligned ?
      Math.min(maxHeight, dropdownBounds.bottom)
      :
      Math.min(maxHeight, viewportHeight - dropdownBounds.top)

    const currentHeight = dropdownBounds.height || dropdownBounds.bottom - dropdownBounds.top

    if (suggestedHeight !== currentHeight) {
      instance._dropdownContent.style.height = `${suggestedHeight}px`
    }
  }

  function onKeyDown(instance, event) {
    let shouldToggleDropdown = false
    switch (event.keyCode) {
      case 27: // escape
        shouldToggleDropdown = instance._dropdown && instance._dropdown.parentNode
        break
      case 38: // up
      case 40: // down
        shouldToggleDropdown = event.altKey
        if (!instance._select.multiple && !event.altKey && navigator.platform === 'MacIntel') {
          // The macOS browsers rely on the native select dropdown, which is opened whenever the user wants to change
          // the selected value, so we have to do the change ourselves.
          event.preventDefault()
          const selectedIndexDelta = event.keyCode === 38 ? -1 : 1
          const select = instance._select
          let newIndex = select.selectedIndex
          let lastNewIndex = newIndex
          do {
            newIndex = Math.max(0, Math.min(newIndex + selectedIndexDelta, select.options.length - 1))
            if (newIndex === lastNewIndex) {
              // all options in the chosen direction are disabled
              return
            }
            lastNewIndex = newIndex
          } while (select.options.item(newIndex).disabled || select.options.item(newIndex).parentNode.disabled)
          select.selectedIndex = Math.max(0, Math.min(newIndex, select.options.length - 1))
          select.dispatchEvent(new CustomEvent('change', {bubbles: true, cancelable: true}))
        }
        break
      case 32: // space
        shouldToggleDropdown = instance._dropdown && !instance._dropdown.parentNode
        if (instance._dropdown && instance._dropdown.parentNode) {
          event.preventDefault() // Prevent Safari from opening the native dropdown
        }
        break
      case 13: // enter
        shouldToggleDropdown = true
        break
      default:
        break // nothing to do
    }

    if (shouldToggleDropdown) {
      event.preventDefault() // Prevent Safari from opening the native dropdown
      onToggleDropdown(instance, event)
    }
  }

  function onFocus(instance) {
    if (instance._blurTimeout) {
      clearTimeout(instance._blurTimeout)
      instance._blurTimeout = null
    }

    if (instance._select.multiple) {
      instance._uiContainer.firstElementChild.setAttribute('data-szn-select-active', '')
    } else {
      instance._button.setAttribute('data-szn-select-active', '')
    }
  }

  function onBlur(instance) {
    if (instance._blurTimeout) {
      clearTimeout(instance._blurTimeout)
    }
    instance._blurTimeout = setTimeout(() => {
      if (instance._select.multiple) {
        instance._uiContainer.firstElementChild.removeAttribute('data-szn-select-active')
      } else {
        instance._button.removeAttribute('data-szn-select-active')
      }
    }, 1000 / 30)
  }

  function onCloseDropdown(instance) {
    if (instance._select.multiple || !instance._dropdown.parentNode) {
      return
    }

    if (instance._button._broker) {
      instance._button.setOpen(false)
    }
    instance._dropdown.parentNode.removeChild(instance._dropdown)
  }

  function onUpdateNeeded(instance) {
    if (instance._select.multiple) {
      return
    }

    const select = instance._select
    if (document.activeElement !== select) {
      select.focus()
    }
  }

  function onToggleDropdown(instance, event) {
    if (instance._select.disabled) {
      return
    }

    instance._select.focus()

    if (instance._select.multiple) {
      return
    }

    event.stopPropagation()
    if (instance._dropdown.parentNode) {
      if (instance._button._broker) {
        instance._button.setOpen(false)
      }
      instance._dropdown.parentNode.removeChild(instance._dropdown)
    } else {
      if (instance._button._broker) {
        instance._button.setOpen(true)
      }
      instance._dropdownContainer.appendChild(instance._dropdown)

      let dropdownReady = false
      let optionsReady = false
      SznElements.awaitElementReady(instance._dropdown, () => {
        dropdownReady = true
        if (optionsReady) {
          initDropdown(instance, instance._dropdown, instance._dropdownOptions)
        }
      })
      SznElements.awaitElementReady(instance._dropdownOptions, () => {
        optionsReady = true
        if (dropdownReady) {
          initDropdown(instance, instance._dropdown, instance._dropdownOptions)
        }
      })
    }
  }

  function onDropdownPositionChange(instance, verticalAlignment) {
    const isOpenedAtTop = verticalAlignment === instance._dropdown.VERTICAL_ALIGN.TOP
    instance._dropdownPosition = verticalAlignment
    if (instance._button && instance._button._broker) {
      const {OPENING_POSITION} = instance._button
      instance._button.setOpeningPosition(isOpenedAtTop ? OPENING_POSITION.UP : OPENING_POSITION.DOWN)
    }
    onDropdownSizeUpdateNeeded(instance)
  }

  function createUI(instance) {
    if (!instance._select || !instance._uiContainer) {
      return
    }

    clearUi(instance)

    if (instance._select.multiple) {
      createMultiSelectUi(instance)
    } else {
      createSingleSelectUi(instance)
    }

    finishInitialization(instance)
  }

  function createSingleSelectUi(instance) {
    initSingleSelectButton(instance)

    instance._dropdownOptions = document.createElement('szn-options')
    instance._dropdown = document.createElement('szn-tethered')
    instance._dropdown.appendChild(instance._dropdownContent)
    instance._dropdownContent.appendChild(instance._dropdownOptions)
  }

  function initSingleSelectButton(instance) {
    const button = document.createElement('szn-select-button')
    SznElements.awaitElementReady(button, () => {
      if (instance._button !== button) {
        return
      }

      instance._button.setSelectElement(instance._select)
      if (instance._dropdown.parentNode) {
        instance._button.setOpen(true)
      }
      if (instance._dropdownPosition) {
        onDropdownPositionChange(instance, instance._dropdownPosition)
      }
    })

    instance._button = button
    instance._uiContainer.appendChild(button)
  }

  function initDropdown(instance, dropdown, options) {
    dropdown.setTether(instance._uiContainer)
    options.setOptions(instance._select)
    dropdown.minBottomSpace = instance._minBottomSpace
    dropdown.onVerticalAlignmentChange = instance._onDropdownPositionChange
    instance._onDropdownPositionChange(dropdown.verticalAlignment)
    onDropdownSizeUpdateNeeded(instance)
  }

  function createMultiSelectUi(instance) {
    const select = instance._select
    const options = document.createElement('szn-options')
    instance._uiContainer.appendChild(options)
    SznElements.awaitElementReady(options, () => options.setOptions(select))
  }

  function finishInitialization(instance) {
    const rootAttributes = {
      'data-szn-select-ready': '',
    }
    rootAttributes['data-szn-select-single'] = instance._select.multiple ? null : ''

    if (instance._root.hasAttribute('data-szn-select-standalone')) {
      setAttributes(instance._root, rootAttributes)
    } else {
      instance._root.dispatchEvent(new CustomEvent('szn-select:ready', {
        bubbles: true,
        cancelable: true,
        detail: {
          attributes: rootAttributes,
        },
      }))
    }
  }

  function clearUi(instance) {
    instance._uiContainer.innerHTML = ''
    instance._dropdownContent.innerHTML = ''
    if (instance._dropdown && instance._dropdown.parentNode) {
      instance._dropdown.parentNode.removeChild(instance._dropdown)
    }
    instance._button = null
    instance._dropdown = null
    instance._dropdownPosition = null
    instance._dropdownOptions = null
  }

  function setAttributes(element, attributes) {
    for (const attributeName of Object.keys(attributes)) {
      if (attributes[attributeName] === null) {
        element.removeAttribute(attributeName)
      } else {
        element.setAttribute(attributeName, attributes[attributeName])
      }
    }
  }

  if (SznElements.init) {
    SznElements.init()
  }
})(self)

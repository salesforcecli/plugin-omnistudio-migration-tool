import { Messages } from '@salesforce/core';
import { expect } from 'chai';
import { reportingHelper } from '../../../src/utils/resultsbuilder/reportingHelper';
import { documentRegistry } from '../../../src/utils/constants/documentRegistry';
import { OSAssessmentInfo } from '../../../src/utils/interfaces';
import { CTASummary } from '../../../src/utils/reportGenerator/reportInterfaces';

const assessMessages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'assess');

/**
 * The CTA helper only iterates `assessmentInfo.warnings`; the rest of the
 * fields are unused but the union type requires them, so build a minimal info
 * with empty defaults instead of restating the boilerplate per call.
 */
function infoWith(warnings: string[]): OSAssessmentInfo {
  return {
    name: 'noop',
    id: 'noop',
    oldName: 'noop',
    type: 'OmniScript',
    dependenciesIP: [],
    missingIP: [],
    dependenciesDR: [],
    missingDR: [],
    dependenciesOS: [],
    missingOS: [],
    dependenciesRemoteAction: [],
    dependenciesLWC: [],
    infos: [],
    warnings,
    errors: [],
    migrationStatus: 'Warnings',
  };
}

describe('reportingHelper.getCallToAction — Custom CSS namespace warnings', () => {
  it('resolves the OmniScript stylesheet warning to the OmniScript styling help URL', () => {
    const message = assessMessages.getMessage('customCssStylesheetNamespaceWarningOmniScript', ['mySheet']);
    const ctas: CTASummary[] = reportingHelper.getCallToAction([infoWith([message])]);
    const cta = ctas.find((c) => c.name === 'customCssStylesheetNamespaceWarningOmniScript');
    expect(cta, 'expected CTA for OmniScript stylesheet warning').to.not.equal(undefined);
    expect(cta.message).to.equal(message);
    expect(cta.link).to.equal(documentRegistry.customCssStylesheetNamespaceWarningOmniScript);
  });

  it('resolves the FlexCard stylesheet warning to the FlexCard custom-Lightning-styles help URL', () => {
    const message = assessMessages.getMessage('customCssStylesheetNamespaceWarningFlexCard', ['mySheet']);
    const ctas: CTASummary[] = reportingHelper.getCallToAction([infoWith([message])]);
    const cta = ctas.find((c) => c.name === 'customCssStylesheetNamespaceWarningFlexCard');
    expect(cta, 'expected CTA for FlexCard stylesheet warning').to.not.equal(undefined);
    expect(cta.message).to.equal(message);
    expect(cta.link).to.equal(documentRegistry.customCssStylesheetNamespaceWarningFlexCard);
  });

  it('resolves the inline-CSS warning to the FlexCard element-CSS help URL', () => {
    const message = assessMessages.getMessage('customCssInlineNamespaceWarning');
    const ctas: CTASummary[] = reportingHelper.getCallToAction([infoWith([message])]);
    const cta = ctas.find((c) => c.name === 'customCssInlineNamespaceWarning');
    expect(cta, 'expected CTA for inline-CSS warning').to.not.equal(undefined);
    expect(cta.message).to.equal(message);
    expect(cta.link).to.equal(documentRegistry.customCssInlineNamespaceWarning);
  });

  it('keeps OmniScript and FlexCard stylesheet warnings disambiguated when both appear in the same report', () => {
    // Same `mySheet` resource name on both sides — only the per-key text differs.
    const osMessage = assessMessages.getMessage('customCssStylesheetNamespaceWarningOmniScript', ['mySheet']);
    const fcMessage = assessMessages.getMessage('customCssStylesheetNamespaceWarningFlexCard', ['mySheet']);
    const ctas: CTASummary[] = reportingHelper.getCallToAction([infoWith([osMessage, fcMessage])]);

    const osCta = ctas.find((c) => c.name === 'customCssStylesheetNamespaceWarningOmniScript');
    const fcCta = ctas.find((c) => c.name === 'customCssStylesheetNamespaceWarningFlexCard');
    expect(osCta, 'expected OmniScript CTA').to.not.equal(undefined);
    expect(fcCta, 'expected FlexCard CTA').to.not.equal(undefined);
    expect(osCta.link).to.equal(documentRegistry.customCssStylesheetNamespaceWarningOmniScript);
    expect(fcCta.link).to.equal(documentRegistry.customCssStylesheetNamespaceWarningFlexCard);
    expect(osCta.link).to.not.equal(fcCta.link);
  });

  it('dedupes by `name` so the same key surfaces once even across many rows', () => {
    const message = assessMessages.getMessage('customCssInlineNamespaceWarning');
    const ctas: CTASummary[] = reportingHelper.getCallToAction([
      infoWith([message]),
      infoWith([message]),
      infoWith([message]),
    ]);
    const matching = ctas.filter((c) => c.name === 'customCssInlineNamespaceWarning');
    expect(matching).to.have.length(1);
  });
});

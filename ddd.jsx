function main(compWidth, compHeight, compFrameRate) {
    var edlFile;
    edlFile = File.openDialog('Select an EDL file');
    if (!edlFile) {
        alert('No file selected!');
        return;
    }
    
    function parseEDL(edlFile) {
        edlFile.open("r");
        var lines = edlFile.read().split("\n");
        edlFile.close();
    
        // Remove last row (expected to be blank)
        lines.pop(); // TODO: Check whether last row is blank
    
        var colNames = lines.shift().replace(/"/g, '').split(';');
    
        var edl = []; // Array of clips (aka "reels")
        for (var rowIndex = 0; rowIndex < lines.length; rowIndex++) { 
            var cols = lines[rowIndex].replace(/"/g, '').split('; ');
            edl.push({});
            for (var colIndex = 0; colIndex < cols.length; colIndex++) { 
                var field = colNames[colIndex];
                edl[rowIndex][field] = cols[colIndex];
                continue;
            }
        }
    
        // perhaps have a dictionary of field names and functions to both cast and convert (e.g secs to ms)
        var floatFields = [
            // "Length", // This is just StreamLength cast to int
            'StartTime', 
            'StreamStart',
            'StreamLength',
            'PlayRate',
            'PlayPitch',
            'FadeTimeIn',
            'FadeTimeOut'
        ];
    
        for (var i = 0; i < floatFields.length; i++) {
            for (var j = 0; j < edl.length; j++) {
                edl[j][floatFields[i]] = parseFloat(edl[j][floatFields[i]]);
            }
        }
    
        return edl;
    }
    
    var compName = edlFile.name.split('.txt')[0]; 
    var edl = parseEDL(edlFile);

    var compBaseDuration = 1; // Subtracted later // Default for now, must be calculated
    var comp = app.project.items.addComp(
        name=compName,
        width=compWidth,
        height=compHeight,
        pixelAspect=1,
        duration=compBaseDuration,
        frameRate=compFrameRate
    );
    
    function importFootage(edlClip) {
        var footageItem;
        // This doesn't work atm, but has to be fixed. Each clip is imported as a new item
        // for (var j = 1; j <= app.project.numItems; j++) {
        //     if (app.project.item(j).name === edlClip.FileName) {
        //         footageItem = app.project.item(j);
        //         break;
        //     }
        // }
        if (!footageItem) {
            try {
                footageItem = app.project.importFile(
                    new ImportOptions(File(edlClip.FileName))
                );
            }
            catch (e) {
                // TODO: Defer the alert & list all missing files
                alert('Failed to import file: ' + edlClip.FileName);
                footageItem = app.project.importPlaceholder(
                    edlClip.FileName,
                    compWidth,
                    compHeight,
                    compFrameRate,
                    edlClip.StreamLength / 1000
                )
            }
        }
        return footageItem;
    }
    
    for (var clipIndex = 0; clipIndex < edl.length; clipIndex++) {
        var clip = edl[clipIndex];
        var footageItem = importFootage(clip);
        var layer = comp.layers.add(footageItem);
    
        // Timeline position
        layer.startTime = clip.StartTime / 1000;
        layer.endTime = (clip.StartTime + clip.StreamLength) / 1000;
    
        // Trim points
        layer.inPoint = clip.StreamStart / 1000;
        layer.outPoint = (clip.StartTime + clip.StreamLength) / 1000;
    
        layer.stretch = clip.PlayRate * 100;
    
        function applyFades(handle) {
            var minValue = 0;
            var maxValue = 100;
    
            if (clip.FadeTimeIn > 0) {
                handle.setValueAtTime(layer.inPoint, minValue); 
                handle.setValueAtTime(layer.inPoint + (clip.FadeTimeIn / 1000), maxValue);
            }
            if (clip.FadeTimeOut > 0) {
                handle.setValueAtTime(layer.outPoint - (clip.FadeTimeOut / 1000), maxValue);
                handle.setValueAtTime(layer.outPoint, minValue);
            }
        }
    
        var mediaType = clip.MediaType.toLowerCase();
        if (mediaType === 'audio') { 
            layer.enabled = false; // Disables video
            var mixer = layer.Effects.addProperty('Stereo Mixer');
            applyFades(mixer['Left Level']); 
            applyFades(mixer['Right Level']);
        } else if (mediaType === 'video') {
            layer.audioEnabled = false; // Disables audio
            applyFades(layer['opacity']);
        } else {
            throw new Error('Media type not supported: ' + clip.MediaType); 
        }
    
        // TODO: Fix comp duration (exess end time)
        // prev: layer.outPoint - layer.inPoint
        var clipDuration = clip.StreamLength / 1000;
        comp.duration += clipDuration;
    }

    comp.duration -= compBaseDuration;
    comp.openInViewer();
}

function drawPanel(rootPanel) {
    var title = 'Vegas EDL Import';
    var panel = (rootPanel instanceof Panel)
        ? rootPanel
        : new Window('palette', title, undefined);

    panel.text = title;
    
    var grpCompRes = panel.add('group');
    grpCompRes.orientation = 'row';
    
    lblCompWidth = grpCompRes.add('statictext', undefined, 'Width:'); 
    txtCompWidth = grpCompRes.add('edittext', undefined, '1920')
    txtCompWidth.characters = 4; 
    
    lblCompHeight = grpCompRes.add('statictext', undefined, 'Height:'); 
    txtCompHeight = grpCompRes.add('edittext', undefined, '1080')
    txtCompHeight.characters = 4; 
    
    var grpOther = panel.add('group');
    grpOther.orientation = 'row';
    lblCompFrameRate = grpOther.add('statictext', undefined, 'Frame Rate:'); 
    txtCompFrameRate = grpOther.add('edittext', undefined, '24')
    txtCompFrameRate.characters = 2;
    
    panel.add('button', undefined, 'Import EDL...').onClick = function() { 
        var compWidth = parseInt(txtCompWidth.text);
        var compHeight = parseInt(txtCompHeight.text);
        var compFrameRate = parseInt(txtCompFrameRate.text);
        main(compWidth, compHeight, compFrameRate);
        panel.close(); // If running undocked
    };
    
    return panel;
}

var panel = drawPanel(this);

// Necessary? Also, this can be moved outside
panel.onResizing = panel.onResize = function() {
    this.layout.resize();
};

if (panel instanceof Window) {
    // Running undocked
    panel.center();
    panel.show();
} else {
    // Running as a docked panel
    panel.layout.layout(true);
    panel.layout.resize();
}

// rename/recolor repeating datasources where one is audio, other is video
// might want to sort the layers by start time
// in order to preserve the logical order of clips
// rainbow color layers like in fl?
// handle missing items
// reverse layer order option
// applyPreset to every clip?

// // Set the final duration of the composition
// compDuration = Math.max(compDuration, startTime + length);